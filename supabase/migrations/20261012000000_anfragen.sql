-- VANA Management: Tabelle für Anfragen aus dem Kontaktformular.
-- Die Website (anon key) darf nur neue Anfragen anlegen, nichts lesen, ändern oder löschen.

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
  notiz                   text
);

create index if not exists anfragen_erstellt_am_idx on public.anfragen (erstellt_am desc);
create index if not exists anfragen_status_idx on public.anfragen (status);

alter table public.anfragen enable row level security;

-- Nur die Formularfelder dürfen von der Website gesetzt werden (status/notiz bleiben intern).
revoke all on public.anfragen from anon, authenticated;
grant insert (name, email, telefon, ort, projektart, nachricht, datenschutz_akzeptiert)
  on public.anfragen to anon;

drop policy if exists "Website darf Anfragen anlegen" on public.anfragen;
create policy "Website darf Anfragen anlegen"
  on public.anfragen
  for insert
  to anon
  with check (datenschutz_akzeptiert);
