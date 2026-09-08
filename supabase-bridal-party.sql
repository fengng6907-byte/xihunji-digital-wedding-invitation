-- XiHunJi 喜婚记 — Bridal Party / 伴郎伴娘 module
-- Run this file ONCE in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.bridal_party_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invitation_id uuid references public.invitations(id) on delete set null,
  name text not null,
  role text not null default 'other' check (role in ('best_man','groomsman','maid_of_honor','bridesmaid','other')),
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  public_token text not null unique default encode(gen_random_bytes(16),'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bridal_party_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references public.bridal_party_members(id) on delete cascade,
  title text not null,
  description text not null default '',
  due_at timestamptz,
  location text not null default '',
  status text not null default 'pending' check (status in ('pending','done')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridal_party_members_owner_idx on public.bridal_party_members(owner_id);
create index if not exists bridal_party_members_invitation_idx on public.bridal_party_members(invitation_id);
create index if not exists bridal_party_tasks_member_idx on public.bridal_party_tasks(member_id);
create index if not exists bridal_party_tasks_owner_idx on public.bridal_party_tasks(owner_id);

alter table public.bridal_party_members enable row level security;
alter table public.bridal_party_tasks enable row level security;

drop policy if exists "owners manage bridal party members" on public.bridal_party_members;
create policy "owners manage bridal party members"
on public.bridal_party_members
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owners manage bridal party tasks" on public.bridal_party_tasks;
create policy "owners manage bridal party tasks"
on public.bridal_party_tasks
for all
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.bridal_party_members m
    where m.id = member_id and m.owner_id = auth.uid()
  )
);

create or replace function public.get_bridal_party_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'member', jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'role', m.role,
      'notes', m.notes
    ),
    'wedding', jsonb_build_object(
      'groom', coalesce(i.groom,''),
      'bride', coalesce(i.bride,''),
      'date_time', i.date_time,
      'venue_name', coalesce(i.venue_name,''),
      'venue_address', coalesce(i.venue_address,'')
    ),
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'description', t.description,
          'due_at', t.due_at,
          'location', t.location,
          'status', t.status,
          'sort_order', t.sort_order
        ) order by t.status asc, t.sort_order asc, t.due_at asc nulls last, t.created_at asc
      )
      from public.bridal_party_tasks t
      where t.member_id = m.id
    ), '[]'::jsonb)
  ) into result
  from public.bridal_party_members m
  left join public.invitations i on i.id = m.invitation_id
  where m.public_token = p_token
  limit 1;

  return result;
end;
$$;

create or replace function public.set_bridal_party_task_status(
  p_token text,
  p_task_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('pending','done') then
    raise exception 'Invalid task status';
  end if;

  update public.bridal_party_tasks t
  set status = p_status, updated_at = now()
  from public.bridal_party_members m
  where t.id = p_task_id
    and t.member_id = m.id
    and m.public_token = p_token;

  return found;
end;
$$;

revoke all on function public.get_bridal_party_portal(text) from public;
revoke all on function public.set_bridal_party_task_status(text,uuid,text) from public;
grant execute on function public.get_bridal_party_portal(text) to anon, authenticated;
grant execute on function public.set_bridal_party_task_status(text,uuid,text) to anon, authenticated;
