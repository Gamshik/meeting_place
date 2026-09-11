create type public.word_game_status as enum ('pending', 'active');

alter table public.word_games
  add column status public.word_game_status not null default 'active',
  add column requested_by uuid references public.profiles (id) on delete cascade,
  add column accepted_at timestamptz;

update public.word_games
set status = 'pending', requested_by = current_player_id, accepted_at = null;

alter table public.word_games alter column requested_by set not null;

alter table public.word_game_rounds
  add column audio_path text check (audio_path is null or char_length(audio_path) <= 240);

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
  game_record record;
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

  select * into game_record from public.word_games
  where partnership_id = p_partnership_id for update;

  if game_record.id is not null then
    return public.word_game_state_payload(game_record.id, requester_id);
  end if;

  insert into public.word_games(partnership_id, current_player_id, requested_by, status)
  values (p_partnership_id, requester_id, requester_id, 'pending')
  returning * into game_record;
  return public.word_game_state_payload(game_record.id, requester_id);
end;
$$;

create or replace function public.respond_to_word_game(p_game_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_record record;
begin
  select game.*, partnership.inviter_id, partnership.invitee_id,
    partnership.status as partnership_status
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = p_game_id for update of game;

  if requester_id is null or game_record.id is null
    or game_record.partnership_status <> 'active'
    or requester_id not in (game_record.inviter_id, game_record.invitee_id)
    or requester_id = game_record.requested_by
    or game_record.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'word_game_invitation_not_available';
  end if;

  if not p_accept then
    delete from public.word_games where id = p_game_id;
    return null;
  end if;

  update public.word_games set status = 'active', accepted_at = now()
  where id = p_game_id;
  return public.word_game_state_payload(p_game_id, requester_id);
end;
$$;

create or replace function public.cancel_word_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
begin
  delete from public.word_games game
  using public.partnerships partnership
  where game.id = p_game_id
    and partnership.id = game.partnership_id
    and partnership.status = 'active'
    and game.status = 'pending'
    and game.requested_by = requester_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'word_game_invitation_not_available';
  end if;
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
  select game.partnership_id, game.status, game.requested_by
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where partnership.status = 'active'
    and (select auth.uid()) in (partnership.inviter_id, partnership.invitee_id);
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
    or game_record.status <> 'active'
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
  select round.*, game.partnership_id, game.status as game_status
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
  select round.*, game.partnership_id, game.status as game_status,
    partnership.inviter_id, partnership.invitee_id, partnership.status as partnership_status
  into round_record
  from public.word_game_rounds round
  join public.word_games game on game.id = round.game_id
  join public.partnerships partnership on partnership.id = game.partnership_id
  where round.id = p_round_id for update of round;
  if requester_id is null or round_record.id is null
    or round_record.game_status <> 'active'
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

revoke execute on function public.respond_to_word_game(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.cancel_word_game(uuid) from public, anon, authenticated;
revoke execute on function public.list_my_word_games() from public, anon, authenticated;
grant execute on function public.respond_to_word_game(uuid, boolean) to authenticated;
grant execute on function public.cancel_word_game(uuid) to authenticated;
grant execute on function public.list_my_word_games() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('word-game-recordings', 'word-game-recordings', false, 8388608, array['audio/wav'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
        else round.audio_path = p_path and round.status in ('awaiting_guess', 'completed')
      end
  );
$$;

revoke execute on function public.can_access_word_game_recording(text, boolean)
  from public, anon, authenticated;
grant execute on function public.can_access_word_game_recording(text, boolean) to authenticated;

create policy "Game explainers upload recordings"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'word-game-recordings'
  and (select public.can_access_word_game_recording(name, true))
);

create policy "Game explainers replace recordings"
on storage.objects for update to authenticated
using (
  bucket_id = 'word-game-recordings'
  and (select public.can_access_word_game_recording(name, true))
)
with check (
  bucket_id = 'word-game-recordings'
  and (select public.can_access_word_game_recording(name, true))
);

create policy "Game participants listen to recordings"
on storage.objects for select to authenticated
using (
  bucket_id = 'word-game-recordings'
  and (
    (select public.can_access_word_game_recording(name, false))
    or (select public.can_access_word_game_recording(name, true))
  )
);

comment on column public.word_games.status is 'A game stays pending until the invited partner accepts.';
comment on column public.word_game_rounds.audio_path is 'Private Supabase Storage path for participant playback.';
