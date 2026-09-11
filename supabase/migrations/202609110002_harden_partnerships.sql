-- Keep attempt counters private. Expected invitation failures return values so
-- PostgreSQL commits their counters instead of rolling them back with an exception.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.invitation_limits (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  attempted_at timestamptz[] not null default '{}' check (cardinality(attempted_at) <= 10)
);
alter table private.invitation_limits enable row level security;
revoke all on private.invitation_limits from public, anon, authenticated;

create index partnerships_pair_history_idx on public.partnerships
  (least(inviter_id, invitee_id), greatest(inviter_id, invitee_id), ended_at desc);

-- Returning a structured result is required to persist failed lookup attempts.
drop function public.invite_partner(text);
create function public.invite_partner(p_target_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  target_id uuid;
  new_partnership_id uuid;
  recent_attempts timestamptz[];
  request_time timestamptz := clock_timestamp();
begin
  if requester_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  insert into private.invitation_limits(profile_id) values (requester_id)
    on conflict (profile_id) do nothing;
  -- Serialize attempts from the same account, including concurrent direct RPC calls.
  select array(select stamp from unnest(limits.attempted_at) stamp
    where stamp > request_time - interval '1 hour')
    into recent_attempts
    from private.invitation_limits limits where profile_id = requester_id for update;
  if cardinality(recent_attempts) >= 10 then
    return jsonb_build_object('ok', false, 'code', 'invitation_rate_limited');
  end if;
  update private.invitation_limits set attempted_at = array_append(recent_attempts, request_time)
    where profile_id = requester_id;

  if p_target_username is null or lower(trim(p_target_username)) !~ '^[a-z0-9_]{3,32}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_username');
  end if;
  select id into target_id from public.profiles
    where username = lower(trim(p_target_username));
  if target_id is null then
    return jsonb_build_object('ok', false, 'code', 'profile_not_found');
  end if;
  if target_id = requester_id then
    return jsonb_build_object('ok', false, 'code', 'cannot_invite_yourself');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(least(requester_id, target_id)::text || greatest(requester_id, target_id)::text, 0));
  if exists (select 1 from public.partnerships
    where least(inviter_id, invitee_id) = least(requester_id, target_id)
      and greatest(inviter_id, invitee_id) = greatest(requester_id, target_id)
      and status in ('pending', 'active')) then
    return jsonb_build_object('ok', false, 'code', 'partnership_already_exists');
  end if;
  if exists (select 1 from public.partnerships
    where least(inviter_id, invitee_id) = least(requester_id, target_id)
      and greatest(inviter_id, invitee_id) = greatest(requester_id, target_id)
      and ended_at > request_time - interval '7 days') then
    return jsonb_build_object('ok', false, 'code', 'invitation_cooldown');
  end if;

  -- This inner exception block preserves the attempt counter on a competing insert.
  begin
    insert into public.partnerships(inviter_id, invitee_id)
      values (requester_id, target_id) returning id into new_partnership_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'partnership_already_exists');
  end;
  return jsonb_build_object('ok', true, 'partnershipId', new_partnership_id);
end;
$$;
revoke all on function public.invite_partner(text) from public, anon, authenticated;
grant execute on function public.invite_partner(text) to authenticated;

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
  attempt integer := 0;
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

  loop
    begin
      insert into public.profiles (id, username, display_name, avatar_url)
      values (new.id, generated_username, left(generated_display_name, 80),
        nullif(new.raw_user_meta_data ->> 'avatar_url', ''));
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt >= 10 then raise; end if;
      generated_username := left(base_username, 7) || '_'
        || left(replace(gen_random_uuid()::text, '-', ''), 24);
    end;
  end loop;

  return new;
end;
$$;


drop function public.list_my_partnerships();
create or replace function public.list_my_partnerships(
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
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
    and (p_before_created_at is null or
      (partnership.created_at, partnership.id) < (p_before_created_at, p_before_id))
  order by partnership.created_at desc, partnership.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;


revoke all on function public.list_my_partnerships(timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.list_my_partnerships(timestamptz, uuid, integer) to authenticated;
-- Explicit role revokes also cover Supabase installations with default function grants.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.respond_to_partnership(uuid, boolean) from public, anon;
revoke execute on function public.end_partnership(uuid) from public, anon;

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

  perform pg_advisory_xact_lock(hashtextextended(least(inviter_id, invitee_id)::text || greatest(inviter_id, invitee_id)::text, 0))
    from public.partnerships where id = p_partnership_id
      and (select auth.uid()) in (inviter_id, invitee_id);
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

  perform pg_advisory_xact_lock(hashtextextended(least(inviter_id, invitee_id)::text || greatest(inviter_id, invitee_id)::text, 0))
    from public.partnerships where id = p_partnership_id
      and (select auth.uid()) in (inviter_id, invitee_id);
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
