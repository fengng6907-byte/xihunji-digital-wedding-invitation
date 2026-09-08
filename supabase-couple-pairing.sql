-- XiHunJi 喜婚记 — Couple account pairing + shared planning state
-- Run this file ONCE in Supabase SQL Editor.

alter table public.invitations
  add column if not exists partner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists pair_code text,
  add column if not exists pair_code_expires_at timestamptz;

create unique index if not exists invitations_pair_code_unique
  on public.invitations(pair_code)
  where pair_code is not null;

create table if not exists public.wedding_shared_state (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  planning_state jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.wedding_shared_state enable row level security;

-- Partners may read/update the same invitation. Existing owner policies remain valid.
drop policy if exists "paired partner read invitation" on public.invitations;
create policy "paired partner read invitation"
on public.invitations for select to authenticated
using (partner_user_id = auth.uid());

drop policy if exists "paired partner update invitation" on public.invitations;
create policy "paired partner update invitation"
on public.invitations for update to authenticated
using (partner_user_id = auth.uid())
with check (partner_user_id = auth.uid());

-- Prevent a paired partner from changing ownership/pairing columns through a normal UPDATE.
create or replace function public.protect_invitation_pair_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.partner_user_id
     and auth.uid() <> old.owner_id then
    new.owner_id := old.owner_id;
    new.partner_user_id := old.partner_user_id;
    new.pair_code := old.pair_code;
    new.pair_code_expires_at := old.pair_code_expires_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_invitation_pair_columns_trigger on public.invitations;
create trigger protect_invitation_pair_columns_trigger
before update on public.invitations
for each row execute function public.protect_invitation_pair_columns();

-- Shared tables: owner OR paired partner can manage rows belonging to the invitation.
alter table public.wedding_tables enable row level security;
drop policy if exists "paired users manage wedding tables" on public.wedding_tables;
create policy "paired users manage wedding tables"
on public.wedding_tables for all to authenticated
using (
  exists (
    select 1 from public.invitations i
    where i.id = invitation_id
      and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.invitations i
    where i.id = invitation_id
      and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
  )
);

alter table public.guests enable row level security;
drop policy if exists "paired users manage guests" on public.guests;
create policy "paired users manage guests"
on public.guests for all to authenticated
using (
  exists (
    select 1 from public.invitations i
    where i.id = invitation_id
      and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.invitations i
    where i.id = invitation_id
      and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
  )
);

-- Bridal party rows also become shared between the two paired users.
do $$ begin
  if to_regclass('public.bridal_party_members') is not null then
    execute 'drop policy if exists "paired users manage bridal members" on public.bridal_party_members';
    execute $p$
      create policy "paired users manage bridal members"
      on public.bridal_party_members for all to authenticated
      using (
        exists (
          select 1 from public.invitations i
          where i.id = invitation_id
            and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
        )
      )
      with check (
        exists (
          select 1 from public.invitations i
          where i.id = invitation_id
            and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
        )
      )
    $p$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.bridal_party_tasks') is not null then
    execute 'drop policy if exists "paired users manage bridal tasks" on public.bridal_party_tasks';
    execute $p$
      create policy "paired users manage bridal tasks"
      on public.bridal_party_tasks for all to authenticated
      using (
        exists (
          select 1
          from public.bridal_party_members m
          join public.invitations i on i.id = m.invitation_id
          where m.id = member_id
            and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
        )
      )
      with check (
        exists (
          select 1
          from public.bridal_party_members m
          join public.invitations i on i.id = m.invitation_id
          where m.id = member_id
            and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
        )
      )
    $p$;
  end if;
end $$;

-- Shared planning-state policies.
drop policy if exists "paired users read shared state" on public.wedding_shared_state;
create policy "paired users read shared state"
on public.wedding_shared_state for select to authenticated
using (
  exists (
    select 1 from public.invitations i
    where i.id = invitation_id
      and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
  )
);

drop policy if exists "paired users write shared state" on public.wedding_shared_state;
create policy "paired users write shared state"
on public.wedding_shared_state for all to authenticated
using (
  exists (
    select 1 from public.invitations i
    where i.id = invitation_id
      and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.invitations i
    where i.id = invitation_id
      and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
  )
);

-- Generate a one-time 8-digit pairing number, valid for 24 hours.
create or replace function public.create_wedding_pair_code(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  code text;
  partner uuid;
  exp timestamptz;
  tries integer := 0;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  select partner_user_id into partner
  from public.invitations
  where id = p_invitation_id and owner_id = uid
  for update;

  if not found then raise exception 'Only the wedding creator can generate a pairing code'; end if;
  if partner is not null then
    return jsonb_build_object('invitation_id',p_invitation_id,'paired',true,'pair_code',null,'expires_at',null);
  end if;

  loop
    tries := tries + 1;
    code := lpad((floor(random()*100000000))::bigint::text,8,'0');
    exit when not exists(select 1 from public.invitations where pair_code = code);
    if tries > 20 then raise exception 'Unable to generate pairing code'; end if;
  end loop;

  exp := now() + interval '24 hours';
  update public.invitations
  set pair_code = code, pair_code_expires_at = exp
  where id = p_invitation_id;

  return jsonb_build_object('invitation_id',p_invitation_id,'paired',false,'pair_code',code,'expires_at',exp);
end;
$$;

-- Join the creator's wedding using the one-time number.
create or replace function public.join_wedding_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := regexp_replace(coalesce(p_code,''),'[^0-9]','','g');
  inv public.invitations%rowtype;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if length(clean) <> 8 then raise exception '请输入 8 位配对号码'; end if;

  select * into inv
  from public.invitations
  where pair_code = clean
    and pair_code_expires_at > now()
  for update;

  if not found then raise exception '配对号码无效或已过期'; end if;
  if inv.owner_id = uid then raise exception '这是你自己的婚礼账号'; end if;
  if inv.partner_user_id is not null and inv.partner_user_id <> uid then
    raise exception '这场婚礼已经完成配对';
  end if;

  update public.invitations
  set partner_user_id = uid,
      pair_code = null,
      pair_code_expires_at = null
  where id = inv.id;

  return inv.id;
end;
$$;

create or replace function public.get_wedding_pair_status(p_invitation_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'invitation_id', i.id,
    'is_owner', i.owner_id = auth.uid(),
    'paired', i.partner_user_id is not null,
    'pair_code', case when i.owner_id = auth.uid() then i.pair_code else null end,
    'expires_at', case when i.owner_id = auth.uid() then i.pair_code_expires_at else null end
  )
  from public.invitations i
  where i.id = p_invitation_id
    and (i.owner_id = auth.uid() or i.partner_user_id = auth.uid())
  limit 1;
$$;

revoke all on function public.create_wedding_pair_code(uuid) from public;
revoke all on function public.join_wedding_by_code(text) from public;
revoke all on function public.get_wedding_pair_status(uuid) from public;
grant execute on function public.create_wedding_pair_code(uuid) to authenticated;
grant execute on function public.join_wedding_by_code(text) to authenticated;
grant execute on function public.get_wedding_pair_status(uuid) to authenticated;
