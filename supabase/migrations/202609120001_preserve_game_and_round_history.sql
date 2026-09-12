alter table public.word_games
  drop constraint word_games_partnership_id_key;

create unique index word_games_one_open_session_idx
  on public.word_games (partnership_id)
  where status <> 'finished';

create index word_games_partnership_history_idx
  on public.word_games (partnership_id, finished_at desc, created_at desc);

create or replace function public.word_game_state_payload(
  p_game_id uuid,
  p_requester_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  game_record record;
  round_record record;
  partner_record record;
  requester_score integer;
  partner_score integer;
  round_history jsonb;
begin
  select game.*, partnership.inviter_id, partnership.invitee_id
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = p_game_id
    and partnership.status = 'active'
    and p_requester_id in (partnership.inviter_id, partnership.invitee_id);

  if game_record.id is null then
    raise exception using errcode = 'P0001', message = 'word_game_not_found';
  end if;

  select profile.id, profile.username, profile.display_name, profile.avatar_url
  into partner_record
  from public.profiles profile
  where profile.id = case
    when game_record.inviter_id = p_requester_id then game_record.invitee_id
    else game_record.inviter_id
  end;

  select round.*
  into round_record
  from public.word_game_rounds round
  where round.game_id = p_game_id
  order by round.turn_number desc
  limit 1;

  select count(*) filter (where explainer_id = p_requester_id and score = 1),
    count(*) filter (where explainer_id = partner_record.id and score = 1)
  into requester_score, partner_score
  from public.word_game_rounds
  where game_id = p_game_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', round.id,
    'turnNumber', round.turn_number,
    'explainerId', round.explainer_id,
    'topic', round.topic,
    'status', round.status,
    'word', case
      when round.explainer_id = p_requester_id or round.status in ('completed', 'skipped')
      then round.secret_word else null end,
    'guess', round.guess,
    'isCorrect', round.is_correct,
    'score', round.score,
    'coachScore', case when round.explainer_id = p_requester_id
      then round.coach_score else null end,
    'completedAt', round.completed_at
  ) order by round.turn_number), '[]'::jsonb)
  into round_history
  from public.word_game_rounds round
  where round.game_id = p_game_id;

  return jsonb_build_object(
    'id', game_record.id,
    'partnershipId', game_record.partnership_id,
    'status', game_record.status,
    'requestedById', game_record.requested_by,
    'acceptedAt', game_record.accepted_at,
    'currentPlayerId', game_record.current_player_id,
    'partner', jsonb_build_object(
      'id', partner_record.id,
      'username', partner_record.username,
      'displayName', partner_record.display_name,
      'avatarUrl', partner_record.avatar_url
    ),
    'scores', jsonb_build_object(
      'you', coalesce(requester_score, 0),
      'partner', coalesce(partner_score, 0)
    ),
    'round', case when round_record.id is null then null else jsonb_build_object(
      'id', round_record.id,
      'turnNumber', round_record.turn_number,
      'explainerId', round_record.explainer_id,
      'topic', round_record.topic,
      'status', round_record.status,
      'secretWord', case
        when round_record.explainer_id = p_requester_id
          or round_record.status in ('completed', 'skipped')
        then round_record.secret_word else null end,
      'forbiddenWords', case
        when round_record.explainer_id = p_requester_id
          or round_record.status in ('completed', 'skipped')
        then to_jsonb(round_record.forbidden_words) else null end,
      'transcript', round_record.transcript,
      'transcriptWords', round_record.transcript_words,
      'audioAvailable', round_record.audio_path is not null,
      'usedForbiddenWord', round_record.used_forbidden_word,
      'guess', round_record.guess,
      'isCorrect', round_record.is_correct,
      'score', round_record.score,
      'coachScore', case when round_record.explainer_id = p_requester_id
        then round_record.coach_score else null end,
      'coachFeedback', case when round_record.explainer_id = p_requester_id
        then round_record.coach_feedback else null end,
      'createdAt', round_record.created_at,
      'completedAt', round_record.completed_at
    ) end,
    'rounds', round_history
  );
end;
$$;

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
    and requester_id in (partnership.inviter_id, partnership.invitee_id)
  order by (game.status <> 'finished') desc, game.created_at desc
  limit 1;

  if game_id is null then
    raise exception using errcode = 'P0001', message = 'word_game_not_found';
  end if;

  return public.word_game_session_payload(game_id, requester_id);
end;
$$;

create or replace function public.start_word_game(p_partnership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_record record;
  partnership_record record;
begin
  if requester_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  select * into partnership_record
  from public.partnerships
  where id = p_partnership_id
  for update;

  if partnership_record.id is null or partnership_record.status <> 'active'
    or requester_id not in (partnership_record.inviter_id, partnership_record.invitee_id) then
    raise exception using errcode = 'P0001', message = 'active_partnership_not_found';
  end if;

  select * into game_record
  from public.word_games
  where partnership_id = p_partnership_id
    and status <> 'finished'
  order by created_at desc
  limit 1
  for update;

  if game_record.id is not null then
    return public.word_game_session_payload(game_record.id, requester_id);
  end if;

  insert into public.word_games(partnership_id, current_player_id, requested_by, status)
  values (p_partnership_id, requester_id, requester_id, 'pending')
  returning * into game_record;

  return public.word_game_session_payload(game_record.id, requester_id);
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

create or replace function public.end_word_game(p_partnership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_id uuid;
begin
  select game.id into game_id
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.partnership_id = p_partnership_id
    and game.status in ('active', 'paused')
    and partnership.status = 'active'
    and requester_id in (partnership.inviter_id, partnership.invitee_id)
  order by game.created_at desc
  limit 1
  for update of game;

  if requester_id is null or game_id is null then
    raise exception using errcode = 'P0001', message = 'word_game_end_not_available';
  end if;

  update public.word_games set
    status = 'finished',
    finished_at = clock_timestamp()
  where id = game_id;
end;
$$;

create or replace function public.list_my_word_games()
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
  select distinct on (game.partnership_id)
    game.partnership_id, game.status, game.requested_by
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where partnership.status = 'active'
    and (select auth.uid()) in (partnership.inviter_id, partnership.invitee_id)
  order by game.partnership_id, (game.status <> 'finished') desc, game.created_at desc;
$$;

create function public.list_my_word_game_history()
returns table (
  history_id uuid,
  partnership_id uuid,
  finished_at timestamptz,
  partner_id uuid,
  partner_username text,
  partner_display_name text,
  partner_avatar_url text,
  my_score bigint,
  partner_score bigint,
  round_count bigint,
  rounds jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    game.id,
    game.partnership_id,
    coalesce(game.finished_at, game.updated_at),
    partner.id,
    partner.username,
    partner.display_name,
    partner.avatar_url,
    count(round.id) filter (
      where round.explainer_id = (select auth.uid()) and round.score = 1
    ),
    count(round.id) filter (
      where round.explainer_id = partner.id and round.score = 1
    ),
    count(round.id),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', round.id,
      'turnNumber', round.turn_number,
      'explainerId', round.explainer_id,
      'topic', round.topic,
      'status', round.status,
      'word', round.secret_word,
      'guess', round.guess,
      'isCorrect', round.is_correct,
      'score', round.score,
      'coachScore', case when round.explainer_id = (select auth.uid())
        then round.coach_score else null end,
      'completedAt', round.completed_at
    ) order by round.turn_number) filter (where round.id is not null), '[]'::jsonb)
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  join public.profiles partner on partner.id = case
    when partnership.inviter_id = (select auth.uid())
      then partnership.invitee_id else partnership.inviter_id end
  left join public.word_game_rounds round on round.game_id = game.id
  where game.status = 'finished'
    and (select auth.uid()) in (partnership.inviter_id, partnership.invitee_id)
  group by game.id, partner.id
  order by coalesce(game.finished_at, game.updated_at) desc, game.id desc;
$$;

revoke execute on function public.list_my_word_game_history() from public, anon, authenticated;
grant execute on function public.list_my_word_game_history() to authenticated;

comment on function public.start_word_game(uuid) is
  'Creates a new game after completion while preserving every previous game and round.';

comment on function public.list_my_word_game_history() is
  'Lists all completed explain-the-word games and their rounds for the authenticated participant.';

comment on table public.word_games is
  'Explain-the-word game sessions; a partnership has at most one unfinished session and keeps completed sessions as history.';
