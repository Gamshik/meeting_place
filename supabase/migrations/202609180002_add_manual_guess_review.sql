alter table public.word_game_rounds
  add column manual_reviewed_at timestamptz,
  add column manually_approved boolean,
  add constraint word_game_rounds_manual_review_pair check (
    (manual_reviewed_at is null) = (manually_approved is null)
  );

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
  if round_record.status <> 'awaiting_guess' or round_record.guess is not null then
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
  answer_matches boolean;
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
    or round_record.guess is not null or nullif(trim(p_guess), '') is null
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
  ) into answer_matches;

  correct := answer_matches and (
    round_record.game_mode = 'live_call'
    or not coalesce(round_record.used_forbidden_word, false)
  );

  if answer_matches then
    update public.word_game_rounds
    set status = 'completed', guess = left(trim(p_guess), 80), is_correct = correct,
      score = case when correct then 1 else 0 end, completed_at = now()
    where id = p_round_id;
    update public.word_games set current_player_id = requester_id where id = round_record.game_id;
  else
    update public.word_game_rounds
    set guess = left(trim(p_guess), 80), is_correct = null, score = null, completed_at = null
    where id = p_round_id;
  end if;

  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

create function public.review_word_game_guess(p_round_id uuid, p_approved boolean)
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
  select round.*, game.status as game_status, partnership.status as partnership_status,
    partnership.inviter_id, partnership.invitee_id
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  join public.partnerships partnership on partnership.id = game.partnership_id
  where round.id = p_round_id
  for update of round;

  if requester_id is null or round_record.id is null or p_approved is null
    or round_record.game_status <> 'active'
    or round_record.partnership_status <> 'active'
    or round_record.explainer_id <> requester_id
    or requester_id not in (round_record.inviter_id, round_record.invitee_id)
    or round_record.status <> 'awaiting_guess'
    or round_record.guess is null
    or round_record.is_correct is not null then
    raise exception using errcode = 'P0001', message = 'word_game_guess_review_not_available';
  end if;

  guesser_id := case
    when requester_id = round_record.inviter_id then round_record.invitee_id
    else round_record.inviter_id
  end;

  update public.word_game_rounds
  set status = 'completed', is_correct = p_approved,
    score = case when p_approved then 1 else 0 end,
    manual_reviewed_at = now(), manually_approved = p_approved, completed_at = now()
  where id = p_round_id;

  update public.word_games
  set current_player_id = guesser_id
  where id = round_record.game_id;

  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

revoke execute on function public.review_word_game_guess(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.review_word_game_guess(uuid, boolean) to authenticated;

comment on function public.review_word_game_guess(uuid, boolean) is
  'Lets only the round explainer manually accept or reject an inexact submitted answer.';
comment on column public.word_game_rounds.manual_reviewed_at is
  'When the explainer made the final decision on an inexact submitted answer.';
comment on column public.word_game_rounds.manually_approved is
  'The explainer decision for a manually reviewed answer; null when no review occurred.';
