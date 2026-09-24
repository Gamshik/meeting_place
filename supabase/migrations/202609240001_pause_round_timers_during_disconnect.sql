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
  paused_duration interval;
begin
  select game.*, partnership.inviter_id, partnership.invitee_id,
    partnership.status as partnership_status
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = (
    select candidate.id
    from public.word_games candidate
    where candidate.partnership_id = p_partnership_id
      and candidate.status <> 'finished'
    order by candidate.created_at desc
    limit 1
  )
  for update of game;

  if requester_id is null or game_record.id is null
    or game_record.partnership_status <> 'active'
    or requester_id not in (game_record.inviter_id, game_record.invitee_id) then
    raise exception using errcode = 'P0001', message = 'word_game_not_found';
  end if;

  if game_record.status = 'pending' then
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
      paused_duration := greatest(
        heartbeat_time - coalesce(game_record.paused_at, heartbeat_time),
        interval '0 seconds'
      );

      update public.word_game_rounds
      set
        created_at = created_at + paused_duration,
        recording_started_at = case when recording_started_at is null then null
          else recording_started_at + paused_duration end,
        recording_finished_at = case when recording_finished_at is null then null
          else recording_finished_at + paused_duration end,
        explained_at = case when explained_at is null then null
          else explained_at + paused_duration end
      where game_id = game_record.id
        and status in ('explaining', 'awaiting_guess');

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

comment on function public.heartbeat_word_game(uuid) is
  'Updates participant presence, pauses disconnected games, and preserves open-round timer time across reconnection.';
