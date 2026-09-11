create extension if not exists pgcrypto with schema extensions;

create type public.partnership_status as enum (
  'pending',
  'active',
  'declined',
  'ended'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 32),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]+$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80)
);

create table public.partnerships (
  id uuid primary key default extensions.gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status public.partnership_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  constraint partnerships_two_different_people check (inviter_id <> invitee_id),
  constraint partnerships_acceptance_matches_status check (
    (status = 'active' and accepted_at is not null)
    or (status <> 'active')
  )
);

create unique index partnerships_one_open_pair_idx
  on public.partnerships (
    least(inviter_id, invitee_id),
    greatest(inviter_id, invitee_id)
  )
  where status in ('pending', 'active');

create index partnerships_inviter_idx on public.partnerships (inviter_id, status);
create index partnerships_invitee_idx on public.partnerships (invitee_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger partnerships_set_updated_at
before update on public.partnerships
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_username text;
  generated_username text;
  generated_display_name text;
begin
  base_username := regexp_replace(
    lower(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'preferred_username', ''),
        nullif(new.raw_user_meta_data ->> 'user_name', ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'learner'
      )
    ),
    '[^a-z0-9_]',
    '',
    'g'
  );

  if char_length(base_username) < 3 then
    base_username := 'learner';
  end if;

  generated_username := left(base_username, 23)
    || '_'
    || left(replace(new.id::text, '-', ''), 8);

  generated_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    base_username
  );

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    generated_username,
    left(generated_display_name, 80),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.partnerships enable row level security;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Participants can read their partnerships"
on public.partnerships
for select
to authenticated
using ((select auth.uid()) in (inviter_id, invitee_id));

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.partnerships from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (username, display_name) on table public.profiles to authenticated;
grant select on table public.partnerships to authenticated;

create or replace function public.invite_partner(p_target_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  target_id uuid;
  partnership_id uuid;
begin
  if requester_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  select profile.id
  into target_id
  from public.profiles as profile
  where profile.username = lower(trim(p_target_username));

  if target_id is null then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  if target_id = requester_id then
    raise exception using errcode = 'P0001', message = 'cannot_invite_yourself';
  end if;

  insert into public.partnerships (inviter_id, invitee_id)
  values (requester_id, target_id)
  returning id into partnership_id;

  return partnership_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'partnership_already_exists';
end;
$$;

create or replace function public.respond_to_partnership(
  p_partnership_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  update public.partnerships
  set
    status = case when p_accept then 'active'::public.partnership_status else 'declined'::public.partnership_status end,
    accepted_at = case when p_accept then now() else null end,
    ended_at = case when p_accept then null else now() end
  where id = p_partnership_id
    and invitee_id = (select auth.uid())
    and status = 'pending';

  get diagnostics affected_rows = row_count;

  if affected_rows = 0 then
    raise exception using errcode = 'P0001', message = 'pending_invitation_not_found';
  end if;
end;
$$;

create or replace function public.end_partnership(p_partnership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  affected_rows integer;
begin
  if requester_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  update public.partnerships
  set
    status = 'ended',
    ended_at = now()
  where id = p_partnership_id
    and (
      (status = 'active' and requester_id in (inviter_id, invitee_id))
      or (status = 'pending' and requester_id = inviter_id)
    );

  get diagnostics affected_rows = row_count;

  if affected_rows = 0 then
    raise exception using errcode = 'P0001', message = 'partnership_not_found';
  end if;
end;
$$;

create or replace function public.list_my_partnerships()
returns table (
  partnership_id uuid,
  partnership_status public.partnership_status,
  invitation_direction text,
  partner_id uuid,
  partner_username text,
  partner_display_name text,
  partner_avatar_url text,
  created_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    partnership.id as partnership_id,
    partnership.status as partnership_status,
    case
      when partnership.inviter_id = (select auth.uid()) then 'outgoing'
      else 'incoming'
    end as invitation_direction,
    partner.id as partner_id,
    partner.username as partner_username,
    partner.display_name as partner_display_name,
    partner.avatar_url as partner_avatar_url,
    partnership.created_at,
    partnership.accepted_at
  from public.partnerships as partnership
  join public.profiles as partner
    on partner.id = case
      when partnership.inviter_id = (select auth.uid()) then partnership.invitee_id
      else partnership.inviter_id
    end
  where (select auth.uid()) in (partnership.inviter_id, partnership.invitee_id)
    and partnership.status in ('pending', 'active')
  order by partnership.created_at desc;
$$;

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.invite_partner(text) from public;
revoke execute on function public.respond_to_partnership(uuid, boolean) from public;
revoke execute on function public.end_partnership(uuid) from public;
revoke execute on function public.list_my_partnerships() from public;

grant execute on function public.invite_partner(text) to authenticated;
grant execute on function public.respond_to_partnership(uuid, boolean) to authenticated;
grant execute on function public.end_partnership(uuid) to authenticated;
grant execute on function public.list_my_partnerships() to authenticated;

comment on table public.profiles is 'Public-facing identity data for an authenticated user.';
comment on table public.partnerships is 'A private English-learning relationship between exactly two users.';
comment on function public.invite_partner(text) is 'Creates one pending partnership without exposing the user directory.';
