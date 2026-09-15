alter table public.word_games
  add column explanation_duration_seconds integer not null default 60
  constraint word_games_explanation_duration_range check (explanation_duration_seconds between 30 and 300);

alter table public.word_game_rounds
  add column explanation_duration_seconds integer not null default 60
  constraint word_game_rounds_explanation_duration_range check (explanation_duration_seconds between 30 and 300);

create function public.capture_word_game_round_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select game.explanation_duration_seconds
  into new.explanation_duration_seconds
  from public.word_games game
  where game.id = new.game_id;

  if new.explanation_duration_seconds is null then
    raise exception using errcode = 'P0001', message = 'word_game_not_found';
  end if;

  return new;
end;
$$;

create trigger capture_word_game_round_settings_before_insert
before insert on public.word_game_rounds
for each row execute function public.capture_word_game_round_settings();

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
    'explanationMethod', round.explanation_method,
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
    'mode', game_record.mode,
    'status', game_record.status,
    'requestedById', game_record.requested_by,
    'explanationDurationSeconds', game_record.explanation_duration_seconds,
    'acceptedAt', game_record.accepted_at,
    'pausedAt', game_record.paused_at,
    'reconnectDeadline', game_record.reconnect_deadline,
    'disconnectedPlayerId', game_record.disconnected_player_id,
    'finishedAt', game_record.finished_at,
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
      'transcript', case
        when game_record.mode = 'recorded' or round_record.explainer_id = p_requester_id
        then round_record.transcript else null end,
      'transcriptWords', case
        when game_record.mode = 'recorded' or round_record.explainer_id = p_requester_id
        then round_record.transcript_words else '[]'::jsonb end,
      'audioAvailable', round_record.audio_path is not null and (
        game_record.mode = 'recorded' or round_record.explainer_id = p_requester_id
      ),
      'explanationMethod', round_record.explanation_method,
      'explanationDurationSeconds', round_record.explanation_duration_seconds,
      'usedForbiddenWord', round_record.used_forbidden_word,
      'guess', round_record.guess,
      'isCorrect', round_record.is_correct,
      'score', round_record.score,
      'coachScore', case when round_record.explainer_id = p_requester_id
        then round_record.coach_score else null end,
      'coachFeedback', case when round_record.explainer_id = p_requester_id
        then round_record.coach_feedback else null end,
      'recordingStartedAt', round_record.recording_started_at,
      'recordingFinishedAt', round_record.recording_finished_at,
      'explainedAt', round_record.explained_at,
      'createdAt', round_record.created_at,
      'completedAt', round_record.completed_at
    ) end,
    'rounds', round_history
  );
end;
$$;

create function public.start_word_game(
  p_partnership_id uuid,
  p_mode public.word_game_mode,
  p_explanation_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  partner_id uuid;
  game_record record;
  partnership_record record;
begin
  if requester_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  if p_explanation_duration_seconds not between 30 and 300 then
    raise exception using errcode = 'P0001', message = 'invalid_word_game_settings';
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
  where partnership_id = p_partnership_id and status <> 'finished'
  order by created_at desc
  limit 1
  for update;

  if game_record.id is not null then
    return public.word_game_session_payload(game_record.id, requester_id);
  end if;

  perform profile.id
  from public.profiles profile
  where profile.id in (partnership_record.inviter_id, partnership_record.invitee_id)
  order by profile.id
  for update;

  partner_id := case
    when requester_id = partnership_record.inviter_id then partnership_record.invitee_id
    else partnership_record.inviter_id
  end;

  if exists (
    select 1 from public.word_games game
    join public.partnerships partnership on partnership.id = game.partnership_id
    where game.status in ('active', 'paused')
      and requester_id in (partnership.inviter_id, partnership.invitee_id)
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_player_busy';
  end if;

  if exists (
    select 1 from public.word_games game
    join public.partnerships partnership on partnership.id = game.partnership_id
    where game.status in ('active', 'paused')
      and partner_id in (partnership.inviter_id, partnership.invitee_id)
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_partner_busy';
  end if;

  insert into public.word_games(
    partnership_id, current_player_id, requested_by, status, mode, explanation_duration_seconds
  ) values (
    p_partnership_id, requester_id, requester_id, 'pending', p_mode, p_explanation_duration_seconds
  ) returning * into game_record;

  return public.word_game_session_payload(game_record.id, requester_id);
end;
$$;

create function public.update_word_game_settings(
  p_partnership_id uuid,
  p_explanation_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_record record;
begin
  if requester_id is null or p_explanation_duration_seconds not between 30 and 300 then
    raise exception using errcode = 'P0001', message = 'invalid_word_game_settings';
  end if;

  select game.* into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.partnership_id = p_partnership_id
    and game.status in ('pending', 'active', 'paused')
    and partnership.status = 'active'
  order by game.created_at desc
  limit 1
  for update of game;

  if game_record.id is null or game_record.requested_by <> requester_id then
    raise exception using errcode = 'P0001', message = 'word_game_settings_not_available';
  end if;

  update public.word_games
  set explanation_duration_seconds = p_explanation_duration_seconds
  where id = game_record.id;

  return public.word_game_state_payload(game_record.id, requester_id);
end;
$$;

create or replace function public.expire_word_game_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  round_record record;
  guesser_id uuid;
  deadline timestamptz;
begin
  select round.*, game.partnership_id, game.status as game_status, game.mode as game_mode,
    partnership.status as partnership_status, partnership.inviter_id, partnership.invitee_id
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  join public.partnerships partnership on partnership.id = game.partnership_id
  where round.id = p_round_id
  for update of round;

  if requester_id is null or round_record.id is null
    or round_record.game_status <> 'active'
    or round_record.partnership_status <> 'active'
    or requester_id not in (round_record.inviter_id, round_record.invitee_id) then
    raise exception using errcode = 'P0001', message = 'word_game_round_not_available';
  end if;

  if round_record.status in ('completed', 'skipped') then
    return public.word_game_state_payload(round_record.game_id, requester_id);
  end if;
  if round_record.status <> 'awaiting_guess' then
    raise exception using errcode = 'P0001', message = 'word_game_round_not_available';
  end if;

  deadline := case round_record.game_mode
    when 'live_call' then round_record.created_at
      + make_interval(secs => 5 + round_record.explanation_duration_seconds + 30)
    when 'recorded' then round_record.explained_at + interval '90 seconds'
    else null
  end;

  if deadline is null then
    raise exception using errcode = 'P0001', message = 'word_game_round_not_available';
  end if;
  if now() < deadline then
    raise exception using errcode = 'P0001', message = 'word_game_round_not_expired';
  end if;

  guesser_id := case
    when round_record.explainer_id = round_record.inviter_id then round_record.invitee_id
    else round_record.inviter_id
  end;

  update public.word_game_rounds
  set status = 'completed', guess = null, is_correct = false, score = 0, completed_at = now()
  where id = p_round_id;
  update public.word_games set current_player_id = guesser_id where id = round_record.game_id;

  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

create or replace function public.guess_word_game_round(p_round_id uuid, p_guess text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  round_record record;
  correct boolean;
begin
  select round.*, game.partnership_id, game.status as game_status, game.mode as game_mode
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  where round.id = p_round_id for update of round;

  if requester_id is null or round_record.id is null
    or round_record.game_status <> 'active'
    or round_record.explainer_id = requester_id or round_record.status <> 'awaiting_guess'
    or not exists (
      select 1 from public.partnerships
      where id = round_record.partnership_id
        and status = 'active'
        and requester_id in (inviter_id, invitee_id)
    ) then
    raise exception using errcode = 'P0001', message = 'word_game_guess_not_available';
  end if;

  if round_record.game_mode = 'live_call' and (
    now() < round_record.created_at + interval '5 seconds'
    or now() >= round_record.created_at
      + make_interval(secs => 5 + round_record.explanation_duration_seconds + 30)
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_guess_not_available';
  end if;
  if round_record.game_mode = 'recorded' and (
    round_record.explained_at is null
    or now() >= round_record.explained_at + interval '90 seconds'
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_guess_not_available';
  end if;

  select exists (
    select 1 from unnest(round_record.accepted_answers) answer
    where public.normalize_game_phrase(answer) = public.normalize_game_phrase(p_guess)
  ) and (
    round_record.game_mode = 'live_call'
    or not coalesce(round_record.used_forbidden_word, false)
  ) into correct;

  update public.word_game_rounds
  set status = 'completed', guess = left(trim(p_guess), 80), is_correct = correct,
    score = case when correct then 1 else 0 end, completed_at = now()
  where id = p_round_id;
  update public.word_games set current_player_id = requester_id where id = round_record.game_id;

  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

revoke execute on function public.capture_word_game_round_settings() from public, anon, authenticated;
revoke execute on function public.start_word_game(uuid, public.word_game_mode, integer)
  from public, anon, authenticated;
revoke execute on function public.update_word_game_settings(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.start_word_game(uuid, public.word_game_mode, integer) to authenticated;
grant execute on function public.update_word_game_settings(uuid, integer) to authenticated;

comment on column public.word_games.explanation_duration_seconds is
  'Creator-controlled explanation time copied into each new round.';
comment on column public.word_game_rounds.explanation_duration_seconds is
  'Immutable explanation-time snapshot for this round.';
comment on function public.update_word_game_settings(uuid, integer) is
  'Lets the game creator change the explanation time used by future rounds.';
