drop function public.list_my_word_games();

alter type public.word_game_status rename to word_game_status_legacy;
create type public.word_game_status as enum ('pending', 'active', 'paused', 'finished');

alter table public.word_games alter column status drop default;
alter table public.word_games
  alter column status type public.word_game_status
  using status::text::public.word_game_status;
alter table public.word_games alter column status set default 'active';
drop type public.word_game_status_legacy;

alter table public.word_games
  add column inviter_last_seen_at timestamptz,
  add column invitee_last_seen_at timestamptz,
  add column presence_ready boolean not null default false,
  add column paused_at timestamptz,
  add column reconnect_deadline timestamptz,
  add column disconnected_player_id uuid references public.profiles (id) on delete set null,
  add column finished_at timestamptz;

create or replace function public.word_game_session_payload(
  p_game_id uuid,
  p_requester_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.word_game_state_payload(p_game_id, p_requester_id) || jsonb_build_object(
    'pausedAt', game.paused_at,
    'reconnectDeadline', game.reconnect_deadline,
    'disconnectedPlayerId', game.disconnected_player_id,
    'finishedAt', game.finished_at
  )
  from public.word_games game
  where game.id = p_game_id;
$$;

create or replace function public.get_word_game(p_partnership_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_id uuid;
begin
  if requester_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  select game.id into game_id
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.partnership_id = p_partnership_id
    and partnership.status = 'active'
    and requester_id in (partnership.inviter_id, partnership.invitee_id);
  if game_id is null then
    raise exception using errcode = 'P0001', message = 'word_game_not_found';
  end if;
  return public.word_game_session_payload(game_id, requester_id);
end;
$$;

create or replace function public.heartbeat_word_game(p_partnership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_record record;
  heartbeat_time timestamptz := clock_timestamp();
  other_last_seen timestamptz;
begin
  select game.*, partnership.inviter_id, partnership.invitee_id,
    partnership.status as partnership_status
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.partnership_id = p_partnership_id
  for update of game;

  if requester_id is null or game_record.id is null
    or game_record.partnership_status <> 'active'
    or requester_id not in (game_record.inviter_id, game_record.invitee_id) then
    raise exception using errcode = 'P0001', message = 'word_game_not_found';
  end if;

  if game_record.status in ('pending', 'finished') then
    return public.word_game_session_payload(game_record.id, requester_id);
  end if;

  if requester_id = game_record.inviter_id then
    update public.word_games set inviter_last_seen_at = heartbeat_time where id = game_record.id;
  else
    update public.word_games set invitee_last_seen_at = heartbeat_time where id = game_record.id;
  end if;

  select game.*, partnership.inviter_id, partnership.invitee_id,
    partnership.status as partnership_status
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = game_record.id;

  if game_record.status = 'active' then
    if game_record.inviter_last_seen_at is not null
      and game_record.invitee_last_seen_at is not null then
      update public.word_games set presence_ready = true where id = game_record.id;
      other_last_seen := case when requester_id = game_record.inviter_id
        then game_record.invitee_last_seen_at else game_record.inviter_last_seen_at end;
      if other_last_seen < heartbeat_time - interval '12 seconds' then
        update public.word_games set
          status = 'paused',
          paused_at = heartbeat_time,
          reconnect_deadline = heartbeat_time + interval '5 minutes',
          disconnected_player_id = case when requester_id = game_record.inviter_id
            then game_record.invitee_id else game_record.inviter_id end
        where id = game_record.id;
      end if;
    end if;
  elsif game_record.status = 'paused' then
    if game_record.reconnect_deadline <= heartbeat_time then
      update public.word_games set status = 'finished', finished_at = heartbeat_time
      where id = game_record.id;
    elsif game_record.inviter_last_seen_at >= heartbeat_time - interval '12 seconds'
      and game_record.invitee_last_seen_at >= heartbeat_time - interval '12 seconds' then
      update public.word_games set status = 'active', paused_at = null,
        reconnect_deadline = null, disconnected_player_id = null
      where id = game_record.id;
    else
      update public.word_games set disconnected_player_id = case
        when game_record.inviter_last_seen_at < heartbeat_time - interval '12 seconds'
          then game_record.inviter_id
        else game_record.invitee_id end
      where id = game_record.id;
    end if;
  end if;

  return public.word_game_session_payload(game_record.id, requester_id);
end;
$$;

create or replace function public.leave_word_game(p_partnership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_record record;
  leave_time timestamptz := clock_timestamp();
begin
  select game.*, partnership.inviter_id, partnership.invitee_id,
    partnership.status as partnership_status
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.partnership_id = p_partnership_id
  for update of game;

  if requester_id is null or game_record.id is null
    or game_record.partnership_status <> 'active'
    or requester_id not in (game_record.inviter_id, game_record.invitee_id) then
    raise exception using errcode = 'P0001', message = 'word_game_not_found';
  end if;

  if requester_id = game_record.inviter_id then
    update public.word_games set inviter_last_seen_at = leave_time - interval '1 day'
    where id = game_record.id;
  else
    update public.word_games set invitee_last_seen_at = leave_time - interval '1 day'
    where id = game_record.id;
  end if;

  if game_record.status = 'active' and game_record.presence_ready then
    update public.word_games set status = 'paused', paused_at = leave_time,
      reconnect_deadline = leave_time + interval '5 minutes',
      disconnected_player_id = requester_id
    where id = game_record.id;
  elsif game_record.status = 'paused' and game_record.reconnect_deadline <= leave_time then
    update public.word_games set status = 'finished', finished_at = leave_time
    where id = game_record.id;
  end if;
end;
$$;

create function public.list_my_word_games()
returns table (
  partnership_id uuid,
  game_status public.word_game_status,
  requested_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select game.partnership_id, game.status, game.requested_by
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where partnership.status = 'active'
    and (select auth.uid()) in (partnership.inviter_id, partnership.invitee_id);
$$;

revoke execute on function public.word_game_session_payload(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.heartbeat_word_game(uuid) from public, anon, authenticated;
revoke execute on function public.leave_word_game(uuid) from public, anon, authenticated;
revoke execute on function public.list_my_word_games() from public, anon, authenticated;
grant execute on function public.heartbeat_word_game(uuid) to authenticated;
grant execute on function public.leave_word_game(uuid) to authenticated;
grant execute on function public.list_my_word_games() to authenticated;

comment on column public.word_games.reconnect_deadline is
  'A paused game expires five minutes after a participant disconnects.';
comment on column public.word_games.presence_ready is
  'True after both participants have reported presence at least once.';
