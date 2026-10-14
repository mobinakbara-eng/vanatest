-- The contact form no longer asks for the project type.
-- Keep the column for older requests, but make it optional and drop the fixed list of values.
alter table public.anfragen drop constraint if exists anfragen_projektart_check;
alter table public.anfragen alter column projektart drop not null;
comment on column public.anfragen.projektart is 'Nur bei älteren Anfragen gesetzt; das Formular fragt die Projektart nicht mehr ab.';
