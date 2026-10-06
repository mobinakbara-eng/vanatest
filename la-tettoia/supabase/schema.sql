-- La Tettoia booking and manager dashboard. Run in the restaurant's Supabase SQL editor.
-- This script can upgrade the earlier demo schema without deleting reservations.
create extension if not exists btree_gist;

create table if not exists public.manager_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists one_manager_account on public.manager_accounts ((true));
alter table public.manager_accounts enable row level security;
revoke all on public.manager_accounts from anon, authenticated;
grant select on public.manager_accounts to authenticated;
drop policy if exists manager_reads_self on public.manager_accounts;
create policy manager_reads_self on public.manager_accounts for select to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.reservations (
  id bigint generated always as identity primary key,
  date date not null,
  time time not null,
  table_id text not null,
  guests int not null,
  name text not null,
  phone text not null,
  email text not null,
  occasion text,
  notes text,
  status text not null default 'pending',
  manager_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slot tsrange generated always as (tsrange(date + time, date + time + interval '2 hours')) stored
);
alter table public.reservations add column if not exists manager_note text;
alter table public.reservations add column if not exists updated_at timestamptz not null default now();
alter table public.reservations alter column status set default 'pending';
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations drop constraint if exists reservation_status_valid;
alter table public.reservations drop constraint if exists no_double_booking;
alter table public.reservations drop constraint if exists manager_note_length;
alter table public.reservations add constraint reservation_status_valid
  check (status in ('pending', 'confirmed', 'cancelled'));
alter table public.reservations add constraint manager_note_length
  check (length(coalesce(manager_note, '')) <= 1000);
alter table public.reservations add constraint no_double_booking
  exclude using gist (table_id with =, slot with &&)
  where (status in ('pending', 'confirmed'));

create or replace function public.booking_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists reservations_updated_at on public.reservations;
create trigger reservations_updated_at before update on public.reservations
  for each row execute function public.booking_updated_at();

alter table public.reservations enable row level security;
revoke all on public.reservations from anon, authenticated;
grant insert (date, time, table_id, guests, name, phone, email, occasion, notes)
  on public.reservations to anon;
grant select on public.reservations to authenticated;
grant update (status, manager_note) on public.reservations to authenticated;

drop policy if exists guest_books on public.reservations;
create policy guest_books on public.reservations for insert to anon
  with check (
    status = 'pending'
    and date between (now() at time zone 'Europe/Berlin')::date
                 and (now() at time zone 'Europe/Berlin')::date + 90
    and date + time >= (now() at time zone 'Europe/Berlin') + interval '1 hour'
    and extract(isodow from date) <> 1
    and time between time '16:00' and time '22:00'
    and extract(minute from time) in (0, 30)
    and extract(second from time) = 0
    and table_id in ('1','2','3','4','5','6','7','8')
    -- tables 1–4 (Sala, left wall): 6 seats · tables 5–8 (Saletta, right room): 4 seats
    and guests between 1 and case when table_id in ('5','6','7','8') then 4 else 6 end
    and length(trim(name)) between 1 and 120
    and length(trim(phone)) between 3 and 40
    and length(trim(email)) between 3 and 160
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and length(coalesce(notes, '')) <= 1000
  );
drop policy if exists manager_reads_reservations on public.reservations;
create policy manager_reads_reservations on public.reservations for select to authenticated
  using (exists (select 1 from public.manager_accounts m where m.user_id = (select auth.uid())));
drop policy if exists manager_updates_reservations on public.reservations;
create policy manager_updates_reservations on public.reservations for update to authenticated
  using (exists (select 1 from public.manager_accounts m where m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.manager_accounts m where m.user_id = (select auth.uid())));

-- Only occupancy, never guest contact details, is public.
create or replace view public.booked_slots as
  select date, time, table_id from public.reservations
  where status in ('pending', 'confirmed');
revoke all on public.booked_slots from anon, authenticated;
grant select on public.booked_slots to anon, authenticated;

-- SECURITY INVOKER keeps the guest insert subject to both grants and RLS.
create or replace function public.book_table(
  p_date date, p_time time, p_table text, p_guests int,
  p_name text, p_phone text, p_email text, p_occasion text default null, p_notes text default null
) returns json
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.reservations (date, time, table_id, guests, name, phone, email, occasion, notes)
  values (p_date, p_time, p_table, p_guests, trim(p_name), trim(p_phone), trim(p_email),
          nullif(trim(p_occasion), ''), nullif(trim(p_notes), ''));
  return json_build_object('status', 'pending');
exception when exclusion_violation then
  raise exception 'taken' using errcode = '23P01';
end $$;
revoke all on function public.book_table(date,time,text,int,text,text,text,text,text) from public, authenticated;
grant execute on function public.book_table(date,time,text,int,text,text,text,text,text) to anon;

create table if not exists public.site_menu (
  id int primary key default 1 check (id = 1),
  content jsonb not null check (jsonb_typeof(content->'food') = 'array'
                                and jsonb_typeof(content->'drinks') = 'array'),
  version int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.site_menu enable row level security;
revoke all on public.site_menu from anon, authenticated;
grant select on public.site_menu to anon, authenticated;
grant update (content, version, updated_at) on public.site_menu to authenticated;
drop policy if exists anyone_reads_menu on public.site_menu;
create policy anyone_reads_menu on public.site_menu for select to anon, authenticated using (true);
drop policy if exists manager_updates_menu on public.site_menu;
create policy manager_updates_menu on public.site_menu for update to authenticated
  using (exists (select 1 from public.manager_accounts m where m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.manager_accounts m where m.user_id = (select auth.uid())));

-- Run seed-menu.sql next. Then provision one Auth user and add its user_id to
-- manager_accounts in the SQL editor; never put a manager password in this repo.
