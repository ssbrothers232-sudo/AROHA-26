-- AROHA '26: live championship and official reveal controls.
-- Run once in Supabase SQL Editor after schema.sql.
-- Public visitors can read the reveal state. Only an admin can change it.
-- The winner snapshot freezes the officially revealed champion(s) at reveal time.

create table if not exists public.festival_settings (
  singleton boolean primary key default true check (singleton = true),
  championship_revealed boolean not null default false,
  champion_departments text[] not null default '{}',
  champion_points integer not null default 0,
  champion_gold integer not null default 0,
  champion_silver integer not null default 0,
  champion_bronze integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.festival_settings
  add column if not exists champion_departments text[] not null default '{}',
  add column if not exists champion_points integer not null default 0,
  add column if not exists champion_gold integer not null default 0,
  add column if not exists champion_silver integer not null default 0,
  add column if not exists champion_bronze integer not null default 0;

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

select singleton, championship_revealed, champion_departments,
       champion_points, champion_gold, champion_silver, champion_bronze,
       updated_at
from public.festival_settings;
