alter table public.word_game_rounds
  add column recording_started_at timestamptz,
  add column recording_finished_at timestamptz;

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

create function public.start_word_game_recording(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  round_record record;
begin
  select round.*, game.partnership_id, game.status as game_status, game.mode as game_mode
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  where round.id = p_round_id
  for update of round;

  if requester_id is null or round_record.id is null
    or round_record.game_status <> 'active'
    or round_record.game_mode <> 'recorded'
    or round_record.explainer_id <> requester_id
    or round_record.status <> 'explaining'
    or not exists (
      select 1 from public.partnerships
      where id = round_record.partnership_id
        and status = 'active'
        and requester_id in (inviter_id, invitee_id)
    ) then
    raise exception using errcode = 'P0001', message = 'word_game_round_not_available';
  end if;

  update public.word_game_rounds
  set recording_started_at = clock_timestamp(), recording_finished_at = null
  where id = p_round_id;

  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

create function public.finish_word_game_recording(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  round_record record;
begin
  select round.*, game.partnership_id, game.status as game_status, game.mode as game_mode
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  where round.id = p_round_id
  for update of round;

  if requester_id is null or round_record.id is null
    or round_record.game_status <> 'active'
    or round_record.game_mode <> 'recorded'
    or round_record.explainer_id <> requester_id
    or round_record.status <> 'explaining'
    or round_record.recording_started_at is null
    or not exists (
      select 1 from public.partnerships
      where id = round_record.partnership_id
        and status = 'active'
        and requester_id in (inviter_id, invitee_id)
    ) then
    raise exception using errcode = 'P0001', message = 'word_game_round_not_available';
  end if;

  update public.word_game_rounds
  set recording_finished_at = clock_timestamp()
  where id = p_round_id;

  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

create or replace function public.submit_word_game_transcript(
  p_round_id uuid,
  p_transcript text,
  p_transcript_words jsonb,
  p_coach_score integer default null,
  p_coach_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  round_record record;
  normalized_transcript text;
  violation boolean;
begin
  select round.*, game.partnership_id, game.status as game_status, game.mode as game_mode
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  where round.id = p_round_id for update of round;

  if requester_id is null or round_record.id is null
    or round_record.game_status <> 'active'
    or round_record.game_mode <> 'recorded'
    or round_record.explainer_id <> requester_id or round_record.status <> 'explaining'
    or round_record.recording_started_at is null
    or round_record.recording_finished_at is null
    or not exists (
      select 1 from public.partnerships
      where id = round_record.partnership_id
        and status = 'active'
        and requester_id in (inviter_id, invitee_id)
    ) then
    raise exception using errcode = 'P0001', message = 'word_game_round_not_available';
  end if;

  normalized_transcript := ' ' || trim(regexp_replace(lower(coalesce(p_transcript, '')),
    '[^a-z0-9]+', ' ', 'g')) || ' ';
  select exists (
    select 1 from unnest(round_record.forbidden_words) forbidden
    where position(' ' || trim(regexp_replace(lower(forbidden), '[^a-z0-9]+', ' ', 'g')) || ' '
      in normalized_transcript) > 0
  ) into violation;

  update public.word_game_rounds set
    transcript = left(trim(p_transcript), 8000),
    transcript_words = case when jsonb_typeof(p_transcript_words) = 'array'
      then p_transcript_words else '[]'::jsonb end,
    audio_path = round_record.game_id::text || '/' || p_round_id::text || '.wav',
    explanation_method = 'recorded',
    used_forbidden_word = violation,
    coach_score = case when p_coach_score between 0 and 100 then p_coach_score else null end,
    coach_feedback = left(nullif(trim(p_coach_feedback), ''), 500),
    status = 'awaiting_guess'
  where id = p_round_id;

  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

drop function public.expire_live_word_game_round(uuid);

create function public.expire_word_game_round(p_round_id uuid)
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
    when 'live_call' then round_record.created_at + interval '95 seconds'
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

  update public.word_games
  set current_player_id = guesser_id
  where id = round_record.game_id;

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
    or now() >= round_record.created_at + interval '95 seconds'
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

  update public.word_games
  set current_player_id = requester_id
  where id = round_record.game_id;

  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

revoke execute on function public.start_word_game_recording(uuid) from public, anon, authenticated;
grant execute on function public.start_word_game_recording(uuid) to authenticated;
revoke execute on function public.finish_word_game_recording(uuid) from public, anon, authenticated;
grant execute on function public.finish_word_game_recording(uuid) to authenticated;
revoke execute on function public.expire_word_game_round(uuid) from public, anon, authenticated;
grant execute on function public.expire_word_game_round(uuid) to authenticated;

comment on column public.word_game_rounds.recording_started_at is
  'Server timestamp for synchronizing the sixty-second Recorded practice capture window.';
comment on column public.word_game_rounds.recording_finished_at is
  'Server timestamp that tells the other player microphone capture has stopped.';
comment on function public.start_word_game_recording(uuid) is
  'Marks the start of a Recorded practice capture after authorizing the active explainer.';
comment on function public.finish_word_game_recording(uuid) is
  'Marks the end of microphone capture while the browser prepares the recorded explanation.';
comment on function public.expire_word_game_round(uuid) is
  'Atomically closes a live-call or recorded round after its mode-specific guessing deadline.';
