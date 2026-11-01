-- AROHA '26: official championship reveal control.
-- Run once in Supabase SQL Editor after schema.sql.
-- Public visitors can read the reveal flag. Only an admin can change it.

create table if not exists public.festival_settings (
  singleton boolean primary key default true check (singleton = true),
  championship_revealed boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.festival_settings (singleton, championship_revealed)
values (true, false)
on conflict (singleton) do nothing;

alter table public.festival_settings enable row level security;

drop policy if exists "festival settings are public to read" on public.festival_settings;
create policy "festival settings are public to read"
on public.festival_settings for select
using (true);

drop policy if exists "admins control championship reveal" on public.festival_settings;
create policy "admins control championship reveal"
on public.festival_settings for update to authenticated
using (public.has_aroha_role('admin'))
with check (public.has_aroha_role('admin'));

grant select on public.festival_settings to anon, authenticated;
grant update on public.festival_settings to authenticated;

-- Confirm the single settings row exists and is initially locked.
select singleton, championship_revealed, updated_at
from public.festival_settings;
