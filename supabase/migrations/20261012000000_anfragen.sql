-- VANA Management: Anfragen aus dem Kontaktformular.
--
-- Sicherheitsmodell: Die Website schreibt NICHT direkt in die Datenbank. Sie ruft die
-- Edge Function "kontakt" auf, die prüft, begrenzt und dann mit dem service_role-Schlüssel
-- speichert. anon/authenticated haben auf diese Tabellen keinerlei Rechte.

-- ---------------------------------------------------------------------------
-- Anfragen
-- ---------------------------------------------------------------------------
create table if not exists public.anfragen (
  id                      uuid primary key default gen_random_uuid(),
  erstellt_am             timestamptz not null default now(),
  name                    text not null check (char_length(name) between 2 and 120),
  email                   text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefon                 text check (char_length(telefon) <= 40),
  ort                     text check (char_length(ort) <= 120),
  projektart              text not null check (projektart in ('Sanierung', 'Trockenbau', 'Sanierung und Trockenbau', 'Sonstiges')),
  nachricht               text not null check (char_length(nachricht) between 10 and 4000),
  datenschutz_akzeptiert  boolean not null check (datenschutz_akzeptiert),
  status                  text not null default 'neu' check (status in ('neu', 'in_bearbeitung', 'erledigt')),
  notiz                   text,
  bearbeitet_am           timestamptz
);

comment on table  public.anfragen is 'Anfragen aus dem Kontaktformular der Website. Schreiben nur über die Edge Function "kontakt".';
comment on column public.anfragen.status is 'neu | in_bearbeitung | erledigt';

create index if not exists anfragen_erstellt_am_idx on public.anfragen (erstellt_am desc);
create index if not exists anfragen_status_idx on public.anfragen (status);

-- bearbeitet_am automatisch setzen, wenn Status oder Notiz geändert werden
create or replace function public.anfragen_bearbeitet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.notiz is distinct from old.notiz then
    new.bearbeitet_am := now();
  end if;
  return new;
end;
$$;

drop trigger if exists anfragen_bearbeitet on public.anfragen;
create trigger anfragen_bearbeitet
  before update on public.anfragen
  for each row execute function public.anfragen_bearbeitet();

alter table public.anfragen enable row level security;
revoke all on public.anfragen from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate-Limit: höchstens N Anfragen pro IP (gehasht) und Zeitfenster
-- ---------------------------------------------------------------------------
create table if not exists public.anfrage_limits (
  id           bigint generated always as identity primary key,
  ip_hash      text not null,
  erstellt_am  timestamptz not null default now()
);

comment on table public.anfrage_limits is 'Gehashte IP-Adressen für das Rate-Limit des Kontaktformulars. Einträge werden nach 24 Stunden gelöscht.';

create index if not exists anfrage_limits_ip_idx on public.anfrage_limits (ip_hash, erstellt_am desc);

alter table public.anfrage_limits enable row level security;
revoke all on public.anfrage_limits from anon, authenticated;

-- Gibt true zurück und zählt die Anfrage, wenn das Limit noch nicht erreicht ist.
create or replace function public.anfrage_rate_limit(
  p_ip_hash text,
  p_max     integer  default 5,
  p_fenster interval default interval '1 hour'
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  anzahl integer;
begin
  delete from public.anfrage_limits where erstellt_am < now() - interval '24 hours';

  select count(*) into anzahl
  from public.anfrage_limits
  where ip_hash = p_ip_hash and erstellt_am > now() - p_fenster;

  if anzahl >= p_max then
    return false;
  end if;

  insert into public.anfrage_limits (ip_hash) values (p_ip_hash);
  return true;
end;
$$;

revoke all on function public.anfrage_rate_limit(text, integer, interval) from public, anon, authenticated;
grant execute on function public.anfrage_rate_limit(text, integer, interval) to service_role;
revoke all on function public.anfragen_bearbeitet() from public, anon, authenticated;
