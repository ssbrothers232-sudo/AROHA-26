-- AROHA '26 results portal schema
-- Run this complete file once in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.departments (
  code text primary key,
  name text not null unique,
  display_order integer not null default 99
);

insert into public.departments (code, name, display_order) values
  ('BBA', 'BBA', 1),
  ('BCOM', 'B.Com', 2),
  ('BA', 'BA', 3),
  ('UNITARY', 'Unitary', 4),
  ('LLM', 'LLM', 5)
on conflict (code) do update set name = excluded.name, display_order = excluded.display_order;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'stage_control')),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  category text not null check (category in ('Stage', 'Literary', 'Fine Arts', 'Other')),
  competition_type text not null check (competition_type in ('individual', 'group', 'programme')),
  event_date date,
  event_time text,
  venue text,
  is_published boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  department_code text not null references public.departments(code),
  placement smallint not null check (placement in (1, 2, 3)),
  winner_name text,
  team_name text,
  team_members text[] not null default '{}',
  image_path text,
  notes text,
  is_published boolean not null default true,
  submitted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aroha_one_result_per_podium_place unique (event_id, placement)
);

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  caption text not null default '',
  image_path text not null,
  is_published boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.result_audit (
  id bigint generated always as identity primary key,
  result_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by uuid,
  old_record jsonb,
  new_record jsonb,
  changed_at timestamptz not null default now()
);

create or replace function public.has_aroha_role(required_role text default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and (required_role is null or role = required_role)
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists results_touch_updated_at on public.results;
create trigger results_touch_updated_at before update on public.results
for each row execute function public.touch_updated_at();

create or replace function public.audit_aroha_result()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.result_audit(result_id, action, changed_by, new_record)
    values (new.id, 'INSERT', auth.uid(), to_jsonb(new));
    return new;
  elsif TG_OP = 'UPDATE' then
    insert into public.result_audit(result_id, action, changed_by, old_record, new_record)
    values (new.id, 'UPDATE', auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.result_audit(result_id, action, changed_by, old_record)
    values (old.id, 'DELETE', auth.uid(), to_jsonb(old));
    return old;
  end if;
end;
$$;

drop trigger if exists results_audit_changes on public.results;
create trigger results_audit_changes after insert or update or delete on public.results
for each row execute function public.audit_aroha_result();

-- Atomic result entry. One department is stored for a group result, so its points are
-- awarded once to that department and are never multiplied by team size.
create or replace function public.submit_aroha_result(
  p_event_id uuid,
  p_department_code text,
  p_placement integer,
  p_winner_name text default null,
  p_team_name text default null,
  p_team_members text[] default '{}',
  p_photo_path text default null,
  p_notes text default null,
  p_result_id uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_type text;
  v_result_id uuid;
begin
  if not (public.has_aroha_role('admin') or public.has_aroha_role('stage_control')) then
    raise exception 'You are not authorised to submit AROHA results.' using errcode = '42501';
  end if;

  if p_placement not in (1, 2, 3) then
    raise exception 'Position must be first, second or third.';
  end if;

  select competition_type into v_type
  from public.events where id = p_event_id;
  if v_type is null then
    raise exception 'Please select a valid event.';
  end if;
  if v_type = 'programme' then
    raise exception 'Results cannot be entered for a non-competitive programme.';
  end if;

  if not exists (select 1 from public.departments where code = p_department_code) then
    raise exception 'Please select a valid department.';
  end if;

  if v_type = 'individual' and coalesce(trim(p_winner_name), '') = '' then
    raise exception 'Enter the individual winner name.';
  end if;
  if v_type = 'group' and coalesce(trim(p_team_name), '') = '' then
    raise exception 'Enter the group/team name.';
  end if;

  if p_result_id is not null then
    update public.results set
      event_id = p_event_id,
      department_code = p_department_code,
      placement = p_placement,
      winner_name = case when v_type = 'individual' then trim(p_winner_name) else null end,
      team_name = case when v_type = 'group' then trim(p_team_name) else null end,
      team_members = case when v_type = 'group' then coalesce(p_team_members, '{}') else '{}' end,
      image_path = coalesce(p_photo_path, image_path),
      notes = nullif(trim(coalesce(p_notes, '')), '')
    where id = p_result_id
    returning id into v_result_id;
    if v_result_id is null then raise exception 'The result record could not be found.'; end if;
  else
    insert into public.results (
      event_id, department_code, placement, winner_name, team_name,
      team_members, image_path, notes, is_published, submitted_by
    ) values (
      p_event_id, p_department_code, p_placement,
      case when v_type = 'individual' then trim(p_winner_name) else null end,
      case when v_type = 'group' then trim(p_team_name) else null end,
      case when v_type = 'group' then coalesce(p_team_members, '{}') else '{}' end,
      p_photo_path, nullif(trim(coalesce(p_notes, '')), ''), true, auth.uid()
    )
    on conflict (event_id, placement) do update set
      department_code = excluded.department_code,
      winner_name = excluded.winner_name,
      team_name = excluded.team_name,
      team_members = excluded.team_members,
      image_path = coalesce(excluded.image_path, public.results.image_path),
      notes = excluded.notes,
      is_published = true,
      submitted_by = auth.uid()
    returning id into v_result_id;
  end if;

  return v_result_id;
end;
$$;

-- The view derives all medal counts and points from the result ledger.
create or replace view public.department_scoreboard with (security_invoker = true) as
select
  d.code,
  d.name,
  d.display_order,
  (count(r.id) filter (where e.id is not null and r.placement = 1))::integer as gold,
  (count(r.id) filter (where e.id is not null and r.placement = 2))::integer as silver,
  (count(r.id) filter (where e.id is not null and r.placement = 3))::integer as bronze,
  coalesce(sum(
    case
      when e.competition_type = 'individual' and r.placement = 1 then 5
      when e.competition_type = 'individual' and r.placement = 2 then 3
      when e.competition_type = 'individual' and r.placement = 3 then 1
      when e.competition_type = 'group' and r.placement = 1 then 10
      when e.competition_type = 'group' and r.placement = 2 then 7
      when e.competition_type = 'group' and r.placement = 3 then 2
      else 0
    end
  ), 0)::integer as points
from public.departments d
left join public.results r on r.department_code = d.code and r.is_published = true
left join public.events e on e.id = r.event_id and e.is_published = true
group by d.code, d.name, d.display_order;

-- Enable RLS everywhere.
alter table public.departments enable row level security;
alter table public.user_roles enable row level security;
alter table public.events enable row level security;
alter table public.results enable row level security;
alter table public.gallery_items enable row level security;
alter table public.result_audit enable row level security;

drop policy if exists "departments are public" on public.departments;
create policy "departments are public" on public.departments for select using (true);

drop policy if exists "users see own role or admins see all" on public.user_roles;
create policy "users see own role or admins see all" on public.user_roles for select to authenticated
using (auth.uid() = user_id or public.has_aroha_role('admin'));
drop policy if exists "admins manage roles" on public.user_roles;
create policy "admins manage roles" on public.user_roles for all to authenticated
using (public.has_aroha_role('admin')) with check (public.has_aroha_role('admin'));

drop policy if exists "published events are public and staff can see all" on public.events;
create policy "published events are public and staff can see all" on public.events for select
using (is_published = true or public.has_aroha_role('stage_control') or public.has_aroha_role('admin'));
drop policy if exists "admins create events" on public.events;
create policy "admins create events" on public.events for insert to authenticated
with check (public.has_aroha_role('admin'));
drop policy if exists "admins update events" on public.events;
create policy "admins update events" on public.events for update to authenticated
using (public.has_aroha_role('admin')) with check (public.has_aroha_role('admin'));
drop policy if exists "admins delete events" on public.events;
create policy "admins delete events" on public.events for delete to authenticated
using (public.has_aroha_role('admin'));

drop policy if exists "published results are public and staff can see all" on public.results;
create policy "published results are public and staff can see all" on public.results for select
using (is_published = true or public.has_aroha_role('stage_control') or public.has_aroha_role('admin'));
drop policy if exists "admins delete results" on public.results;
create policy "admins delete results" on public.results for delete to authenticated
using (public.has_aroha_role('admin'));

drop policy if exists "published gallery is public and staff can see all" on public.gallery_items;
create policy "published gallery is public and staff can see all" on public.gallery_items for select
using (is_published = true or public.has_aroha_role('stage_control') or public.has_aroha_role('admin'));
drop policy if exists "staff upload gallery items" on public.gallery_items;
create policy "staff upload gallery items" on public.gallery_items for insert to authenticated
with check ((public.has_aroha_role('stage_control') or public.has_aroha_role('admin')) and created_by = auth.uid());
drop policy if exists "staff delete gallery items" on public.gallery_items;
create policy "staff delete gallery items" on public.gallery_items for delete to authenticated
using (public.has_aroha_role('admin') or (public.has_aroha_role('stage_control') and created_by = auth.uid()));

drop policy if exists "admins read result audit" on public.result_audit;
create policy "admins read result audit" on public.result_audit for select to authenticated
using (public.has_aroha_role('admin'));

grant select on public.departments, public.events, public.results, public.gallery_items, public.department_scoreboard to anon, authenticated;
grant select on public.user_roles to authenticated;
grant insert, update, delete on public.events to authenticated;
grant insert, delete on public.gallery_items to authenticated;
grant delete on public.results to authenticated;
grant select on public.result_audit to authenticated;
grant execute on function public.submit_aroha_result(uuid,text,integer,text,text,text[],text,text,uuid) to authenticated;

-- Public photo bucket. Uploading is restricted to signed-in stage-control/admin users.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aroha-winner-photos', 'aroha-winner-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "AROHA photos are publicly viewable" on storage.objects;
create policy "AROHA photos are publicly viewable" on storage.objects for select
using (bucket_id = 'aroha-winner-photos');
drop policy if exists "AROHA staff upload photos" on storage.objects;
create policy "AROHA staff upload photos" on storage.objects for insert to authenticated
with check (bucket_id = 'aroha-winner-photos' and (public.has_aroha_role('stage_control') or public.has_aroha_role('admin')));
drop policy if exists "AROHA staff update photos" on storage.objects;
create policy "AROHA staff update photos" on storage.objects for update to authenticated
using (bucket_id = 'aroha-winner-photos' and (public.has_aroha_role('stage_control') or public.has_aroha_role('admin')))
with check (bucket_id = 'aroha-winner-photos' and (public.has_aroha_role('stage_control') or public.has_aroha_role('admin')));
drop policy if exists "AROHA staff delete photos" on storage.objects;
create policy "AROHA staff delete photos" on storage.objects for delete to authenticated
using (bucket_id = 'aroha-winner-photos' and public.has_aroha_role('admin'));

-- IMPORTANT: Create user accounts in Supabase Authentication, then assign a role below:
-- insert into public.user_roles(user_id, role) values ('AUTH-USER-UUID-HERE', 'admin');
-- Roles: 'admin' or 'stage_control'. Do not enable public sign-up.
