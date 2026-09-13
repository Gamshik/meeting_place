create type public.word_game_mode as enum ('recorded', 'live_call');
create type public.word_explanation_method as enum ('recorded', 'live');

alter table public.word_games
  add column mode public.word_game_mode not null default 'recorded';

alter table public.word_game_rounds
  add column explanation_method public.word_explanation_method;

update public.word_game_rounds
set explanation_method = 'recorded'
where transcript is not null or audio_path is not null;

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
      'createdAt', round_record.created_at,
      'completedAt', round_record.completed_at
    ) end,
    'rounds', round_history
  );
end;
$$;

drop function public.start_word_game(uuid);

create function public.start_word_game(
  p_partnership_id uuid,
  p_mode public.word_game_mode
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
    select 1
    from public.word_games game
    join public.partnerships partnership on partnership.id = game.partnership_id
    where game.status in ('active', 'paused')
      and requester_id in (partnership.inviter_id, partnership.invitee_id)
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_player_busy';
  end if;

  if exists (
    select 1
    from public.word_games game
    join public.partnerships partnership on partnership.id = game.partnership_id
    where game.status in ('active', 'paused')
      and partner_id in (partnership.inviter_id, partnership.invitee_id)
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_partner_busy';
  end if;

  insert into public.word_games(partnership_id, current_player_id, requested_by, status, mode)
  values (p_partnership_id, requester_id, requester_id, 'pending', p_mode)
  returning * into game_record;

  return public.word_game_session_payload(game_record.id, requester_id);
end;
$$;

create function public.start_word_game(p_partnership_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.start_word_game(p_partnership_id, 'recorded'::public.word_game_mode);
$$;

create function public.submit_live_word_game_explanation(p_round_id uuid)
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
    or round_record.game_mode <> 'live_call'
    or round_record.explainer_id <> requester_id
    or round_record.status <> 'explaining'
    or not exists (
      select 1 from public.partnerships
      where id = round_record.partnership_id
        and status = 'active'
        and requester_id in (inviter_id, invitee_id)
    ) then
    raise exception using errcode = 'P0001', message = 'word_game_live_explanation_not_available';
  end if;

  update public.word_game_rounds
  set status = 'awaiting_guess', explanation_method = 'live'
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
  select round.*, game.partnership_id, game.status as game_status
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  where round.id = p_round_id for update of round;
  if requester_id is null or round_record.id is null
    or round_record.game_status <> 'active'
    or round_record.explainer_id <> requester_id or round_record.status <> 'explaining'
    or not exists (select 1 from public.partnerships where id = round_record.partnership_id
      and status = 'active' and requester_id in (inviter_id, invitee_id)) then
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
    or not exists (select 1 from public.partnerships where id = round_record.partnership_id
      and status = 'active' and requester_id in (inviter_id, invitee_id)) then
    raise exception using errcode = 'P0001', message = 'word_game_guess_not_available';
  end if;

  select exists (
    select 1 from unnest(round_record.accepted_answers) answer
    where public.normalize_game_phrase(answer) = public.normalize_game_phrase(p_guess)
  ) and (
    round_record.game_mode = 'live_call'
    or not coalesce(round_record.used_forbidden_word, false)
  ) into correct;

  update public.word_game_rounds set status = 'completed', guess = left(trim(p_guess), 80),
    is_correct = correct, score = case when correct then 1 else 0 end, completed_at = now()
  where id = p_round_id;
  update public.word_games set current_player_id = requester_id where id = round_record.game_id;
  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

create or replace function public.can_access_word_game_recording(
  p_path text,
  p_write boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.word_game_rounds round
    join public.word_games game on game.id = round.game_id
    join public.partnerships partnership on partnership.id = game.partnership_id
    where p_path = game.id::text || '/' || round.id::text || '.wav'
      and game.status = 'active'
      and partnership.status = 'active'
      and (select auth.uid()) in (partnership.inviter_id, partnership.invitee_id)
      and case when p_write
        then round.explainer_id = (select auth.uid()) and round.status = 'explaining'
        else round.audio_path = p_path
          and round.status in ('awaiting_guess', 'completed')
          and (game.mode = 'recorded' or round.explainer_id = (select auth.uid()))
      end
  );
$$;

drop function public.list_my_word_games();

create function public.list_my_word_games()
returns table (
  partnership_id uuid,
  game_mode public.word_game_mode,
  game_status public.word_game_status,
  requested_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (game.partnership_id)
    game.partnership_id, game.mode, game.status, game.requested_by
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where partnership.status = 'active'
    and (select auth.uid()) in (partnership.inviter_id, partnership.invitee_id)
  order by game.partnership_id, (game.status <> 'finished') desc, game.created_at desc;
$$;

drop function public.list_my_word_game_history();

create function public.list_my_word_game_history()
returns table (
  history_id uuid,
  partnership_id uuid,
  game_mode public.word_game_mode,
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
    game.mode,
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
      'explanationMethod', round.explanation_method,
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

revoke execute on function public.start_word_game(uuid, public.word_game_mode)
  from public, anon, authenticated;
revoke execute on function public.start_word_game(uuid) from public, anon, authenticated;
revoke execute on function public.submit_live_word_game_explanation(uuid)
  from public, anon, authenticated;
revoke execute on function public.list_my_word_games() from public, anon, authenticated;
revoke execute on function public.list_my_word_game_history() from public, anon, authenticated;

grant execute on function public.start_word_game(uuid, public.word_game_mode) to authenticated;
grant execute on function public.start_word_game(uuid) to authenticated;
grant execute on function public.submit_live_word_game_explanation(uuid) to authenticated;
grant execute on function public.list_my_word_games() to authenticated;
grant execute on function public.list_my_word_game_history() to authenticated;

comment on column public.word_games.mode is
  'Immutable session format selected by the inviter before the game request is sent.';
comment on column public.word_game_rounds.explanation_method is
  'How an explanation was submitted; null while explaining and for skipped rounds.';
comment on function public.submit_live_word_game_explanation(uuid) is
  'Atomically advances an unrecorded live-call explanation to the guessing phase.';
