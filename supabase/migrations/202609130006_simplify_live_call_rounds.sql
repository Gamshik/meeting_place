create function public.prepare_live_word_game_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  game_mode public.word_game_mode;
begin
  select mode into game_mode
  from public.word_games
  where id = new.game_id;

  if game_mode = 'live_call' then
    new.status := 'awaiting_guess';
    new.explanation_method := 'live';
  end if;

  return new;
end;
$$;

create trigger prepare_live_word_game_round_before_insert
before insert on public.word_game_rounds
for each row execute function public.prepare_live_word_game_round();

-- Bring any round created by the previous opt-in live flow into the timed flow.
update public.word_game_rounds round
set status = 'awaiting_guess', explanation_method = 'live'
from public.word_games game
where game.id = round.game_id
  and game.mode = 'live_call'
  and round.status in ('explaining', 'awaiting_guess');

drop function public.submit_live_word_game_explanation(uuid);

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
      and game.mode = 'recorded'
      and game.status = 'active'
      and partnership.status = 'active'
      and (select auth.uid()) in (partnership.inviter_id, partnership.invitee_id)
      and case when p_write
        then round.explainer_id = (select auth.uid()) and round.status = 'explaining'
        else round.audio_path = p_path and round.status in ('awaiting_guess', 'completed')
      end
  );
$$;

create function public.expire_live_word_game_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  round_record record;
  guesser_id uuid;
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
    or round_record.game_mode <> 'live_call'
    or round_record.partnership_status <> 'active'
    or requester_id not in (round_record.inviter_id, round_record.invitee_id) then
    raise exception using errcode = 'P0001', message = 'word_game_live_round_not_available';
  end if;

  if round_record.status in ('completed', 'skipped') then
    return public.word_game_state_payload(round_record.game_id, requester_id);
  end if;

  if round_record.status <> 'awaiting_guess' then
    raise exception using errcode = 'P0001', message = 'word_game_live_round_not_available';
  end if;

  if now() < round_record.created_at + interval '65 seconds' then
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
    or now() >= round_record.created_at + interval '65 seconds'
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

create function public.touch_word_game_from_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.word_games
  set updated_at = now()
  where id = new.game_id;
  return new;
end;
$$;

create trigger touch_word_game_after_round_change
after insert or update on public.word_game_rounds
for each row execute function public.touch_word_game_from_round();

revoke execute on function public.prepare_live_word_game_round() from public, anon, authenticated;
revoke execute on function public.touch_word_game_from_round() from public, anon, authenticated;
revoke execute on function public.expire_live_word_game_round(uuid) from public, anon, authenticated;
grant execute on function public.expire_live_word_game_round(uuid) to authenticated;

comment on function public.expire_live_word_game_round(uuid) is
  'Atomically closes a live-call round after its five-second preparation and sixty-second guessing window.';
