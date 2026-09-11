create type public.word_round_status as enum (
  'explaining',
  'awaiting_guess',
  'completed',
  'skipped'
);

create table public.word_games (
  id uuid primary key default extensions.gen_random_uuid(),
  partnership_id uuid not null unique references public.partnerships (id) on delete cascade,
  current_player_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.word_game_rounds (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references public.word_games (id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  explainer_id uuid not null references public.profiles (id) on delete cascade,
  topic text not null check (char_length(topic) between 2 and 40),
  secret_word text not null check (char_length(secret_word) between 2 and 60),
  accepted_answers text[] not null check (cardinality(accepted_answers) between 1 and 8),
  forbidden_words text[] not null check (cardinality(forbidden_words) between 1 and 12),
  status public.word_round_status not null default 'explaining',
  transcript text check (transcript is null or char_length(transcript) <= 8000),
  transcript_words jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript_words) = 'array'),
  used_forbidden_word boolean,
  guess text check (guess is null or char_length(guess) <= 80),
  is_correct boolean,
  score smallint check (score between 0 and 1),
  coach_score smallint check (coach_score between 0 and 100),
  coach_feedback text check (coach_feedback is null or char_length(coach_feedback) <= 500),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (game_id, turn_number)
);

create unique index word_game_one_open_round_idx
  on public.word_game_rounds (game_id)
  where status in ('explaining', 'awaiting_guess');

create index word_game_rounds_history_idx
  on public.word_game_rounds (game_id, turn_number desc);

create trigger word_games_set_updated_at
before update on public.word_games
for each row execute function public.set_updated_at();

alter table public.word_games enable row level security;
alter table public.word_game_rounds enable row level security;

revoke all on table public.word_games from public, anon, authenticated;
revoke all on table public.word_game_rounds from public, anon, authenticated;

create or replace function public.normalize_game_phrase(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select regexp_replace(lower(trim(coalesce(p_value, ''))), '[^a-z0-9]+', '', 'g');
$$;

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

  return jsonb_build_object(
    'id', game_record.id,
    'partnershipId', game_record.partnership_id,
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
    ) end
  );
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
  game_id uuid;
begin
  if requester_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  if not exists (
    select 1 from public.partnerships
    where id = p_partnership_id and status = 'active'
      and requester_id in (inviter_id, invitee_id)
  ) then
    raise exception using errcode = 'P0001', message = 'active_partnership_not_found';
  end if;

  insert into public.word_games(partnership_id, current_player_id)
  values (p_partnership_id, requester_id)
  on conflict (partnership_id) do nothing;
  select id into game_id from public.word_games where partnership_id = p_partnership_id;
  return public.word_game_state_payload(game_id, requester_id);
end;
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
  return public.word_game_state_payload(game_id, requester_id);
end;
$$;

create or replace function public.create_word_game_round(
  p_game_id uuid,
  p_topic text,
  p_secret_word text,
  p_accepted_answers text[],
  p_forbidden_words text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_record record;
  next_turn integer;
begin
  select game.*, partnership.status as partnership_status,
    partnership.inviter_id, partnership.invitee_id
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = p_game_id for update of game;

  if requester_id is null or game_record.id is null
    or requester_id not in (game_record.inviter_id, game_record.invitee_id)
    or game_record.partnership_status <> 'active'
    or game_record.current_player_id <> requester_id then
    raise exception using errcode = 'P0001', message = 'word_game_turn_not_available';
  end if;
  if exists (select 1 from public.word_game_rounds where game_id = p_game_id
    and status in ('explaining', 'awaiting_guess')) then
    raise exception using errcode = 'P0001', message = 'word_game_round_in_progress';
  end if;

  select coalesce(max(turn_number), 0) + 1 into next_turn
  from public.word_game_rounds where game_id = p_game_id;
  insert into public.word_game_rounds(
    game_id, turn_number, explainer_id, topic, secret_word, accepted_answers, forbidden_words
  ) values (
    p_game_id, next_turn, requester_id, trim(p_topic), lower(trim(p_secret_word)),
    p_accepted_answers, p_forbidden_words
  );
  return public.word_game_state_payload(p_game_id, requester_id);
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
  select round.*, game.partnership_id
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  where round.id = p_round_id for update of round;
  if requester_id is null or round_record.id is null
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
  select round.*, game.partnership_id
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  where round.id = p_round_id for update of round;
  if requester_id is null or round_record.id is null
    or round_record.explainer_id = requester_id or round_record.status <> 'awaiting_guess'
    or not exists (select 1 from public.partnerships where id = round_record.partnership_id
      and status = 'active' and requester_id in (inviter_id, invitee_id)) then
    raise exception using errcode = 'P0001', message = 'word_game_guess_not_available';
  end if;

  select exists (
    select 1 from unnest(round_record.accepted_answers) answer
    where public.normalize_game_phrase(answer) = public.normalize_game_phrase(p_guess)
  ) and not coalesce(round_record.used_forbidden_word, false) into correct;

  update public.word_game_rounds set status = 'completed', guess = left(trim(p_guess), 80),
    is_correct = correct, score = case when correct then 1 else 0 end, completed_at = now()
  where id = p_round_id;
  update public.word_games set current_player_id = requester_id where id = round_record.game_id;
  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

create or replace function public.skip_word_game_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  round_record record;
  next_player_id uuid;
begin
  select round.*, game.partnership_id, partnership.inviter_id, partnership.invitee_id,
    partnership.status as partnership_status
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  join public.partnerships partnership on partnership.id = game.partnership_id
  where round.id = p_round_id for update of round;
  if requester_id is null or round_record.id is null
    or round_record.explainer_id <> requester_id or round_record.status <> 'explaining'
    or round_record.partnership_status <> 'active'
    or requester_id not in (round_record.inviter_id, round_record.invitee_id) then
    raise exception using errcode = 'P0001', message = 'word_game_round_not_available';
  end if;
  next_player_id := case when requester_id = round_record.inviter_id
    then round_record.invitee_id else round_record.inviter_id end;
  update public.word_game_rounds set status = 'skipped', is_correct = false, score = 0,
    completed_at = now() where id = p_round_id;
  update public.word_games set current_player_id = next_player_id where id = round_record.game_id;
  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

revoke execute on function public.normalize_game_phrase(text) from public, anon, authenticated;
revoke execute on function public.word_game_state_payload(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.start_word_game(uuid) from public, anon, authenticated;
revoke execute on function public.get_word_game(uuid) from public, anon, authenticated;
revoke execute on function public.create_word_game_round(uuid, text, text, text[], text[]) from public, anon, authenticated;
revoke execute on function public.submit_word_game_transcript(uuid, text, jsonb, integer, text) from public, anon, authenticated;
revoke execute on function public.guess_word_game_round(uuid, text) from public, anon, authenticated;
revoke execute on function public.skip_word_game_round(uuid) from public, anon, authenticated;

grant execute on function public.start_word_game(uuid) to authenticated;
grant execute on function public.get_word_game(uuid) to authenticated;
grant execute on function public.create_word_game_round(uuid, text, text, text[], text[]) to authenticated;
grant execute on function public.submit_word_game_transcript(uuid, text, jsonb, integer, text) to authenticated;
grant execute on function public.guess_word_game_round(uuid, text) to authenticated;
grant execute on function public.skip_word_game_round(uuid) to authenticated;

comment on table public.word_games is 'One turn-based explain-the-word game per active partnership.';
comment on table public.word_game_rounds is 'Private game rounds; secrets are exposed only through participant-checked functions.';
