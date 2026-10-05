-- La Tettoia – online table booking (Supabase / PostgreSQL)
-- Run once in the Supabase SQL editor, then put the project URL and the
-- publishable (anon) key into CONFIG.booking in js/main.js.

create extension if not exists btree_gist;

create table if not exists public.reservations (
  id         bigint generated always as identity primary key,
  date       date        not null,
  time       time        not null,
  table_id   text        not null,
  guests     int         not null check (guests between 1 and 12),
  name       text        not null check (length(name) between 1 and 120),
  phone      text        not null check (length(phone) between 3 and 40),
  email      text        not null check (length(email) between 3 and 160),
  occasion   text,
  notes      text        check (length(notes) <= 1000),
  status     text        not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  -- a table is blocked for 2 hours from the booked time
  slot tsrange generated always as (tsrange(date + time, date + time + interval '2 hours')) stored,
  -- the database itself rejects double bookings of the same table
  constraint no_double_booking exclude using gist (table_id with =, slot with &&) where (status = 'confirmed')
);

-- Guests never read the reservations table directly (it contains personal data).
alter table public.reservations enable row level security;

-- Public view: only which table is taken when – no names or contact details.
create or replace view public.booked_slots as
  select date, time, table_id from public.reservations where status = 'confirmed';
grant select on public.booked_slots to anon;

-- Booking goes through this function, which validates input and handles conflicts.
create or replace function public.book_table(
  p_date date, p_time time, p_table text, p_guests int,
  p_name text, p_phone text, p_email text, p_occasion text default null, p_notes text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if p_date < (now() at time zone 'Europe/Berlin')::date or p_date > (now() at time zone 'Europe/Berlin')::date + 90 then
    raise exception 'invalid date';
  end if;
  if extract(isodow from p_date) = 1 then raise exception 'closed on monday'; end if;
  if p_time < '16:00' or p_time > '22:00' then raise exception 'invalid time'; end if;
  if p_table not in ('1','2','3','4','5','6','7','8') then raise exception 'invalid table'; end if;

  insert into reservations (date, time, table_id, guests, name, phone, email, occasion, notes)
  values (p_date, p_time, p_table, p_guests, p_name, p_phone, p_email, nullif(p_occasion, ''), nullif(p_notes, ''))
  returning id into new_id;
  return json_build_object('id', new_id);
exception when exclusion_violation then
  raise exception 'taken' using errcode = '23P01';
end $$;

revoke all on function public.book_table from public;
grant execute on function public.book_table to anon;
