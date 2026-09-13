alter table public.profiles
  add column time_zone text;

create or replace function public.validate_profile_time_zone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.time_zone is not null then
    if char_length(new.time_zone) > 64
      or new.time_zone !~ '^[A-Za-z0-9_+\-/]+$'
    then
      raise exception using errcode = 'P0001', message = 'invalid_time_zone';
    end if;

    begin
      perform pg_catalog.timezone(new.time_zone, pg_catalog.now());
    exception when invalid_parameter_value then
      raise exception using errcode = 'P0001', message = 'invalid_time_zone';
    end;
  end if;

  return new;
end;
$$;

create trigger profiles_validate_time_zone
before insert or update of time_zone on public.profiles
for each row execute function public.validate_profile_time_zone();

grant update (time_zone) on table public.profiles to authenticated;

drop function public.get_profile_activity(uuid, integer, text);

create function public.get_profile_activity(
  p_profile_id uuid,
  p_year integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  target_profile record;
  activity_time_zone text;
  result jsonb;
begin
  if requester_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  if p_year not between 2000 and 2100 then
    raise exception using errcode = 'P0001', message = 'invalid_activity_year';
  end if;

  select
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    profile.created_at,
    profile.time_zone
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id;

  if target_profile.id is null or (
    requester_id <> p_profile_id
    and not exists (
      select 1
      from public.partnerships partnership
      where partnership.status = 'active'
        and least(partnership.inviter_id, partnership.invitee_id) = least(requester_id, p_profile_id)
        and greatest(partnership.inviter_id, partnership.invitee_id) = greatest(requester_id, p_profile_id)
    )
  ) then
    raise exception using errcode = 'P0001', message = 'profile_not_available';
  end if;

  activity_time_zone := coalesce(target_profile.time_zone, 'UTC');

  with target_games as (
    select
      game.id,
      game.requested_by,
      game.created_at,
      game.accepted_at,
      game.finished_at,
      game.status,
      partnership.inviter_id,
      partnership.invitee_id
    from public.word_games game
    join public.partnerships partnership on partnership.id = game.partnership_id
    where p_profile_id in (partnership.inviter_id, partnership.invitee_id)
  ),
  events as (
    select
      game.created_at as occurred_at,
      'game_requested'::text as kind,
      game.id as game_id,
      null::uuid as round_id,
      null::text as topic,
      0::integer as speaking_duration_seconds
    from target_games game
    where game.requested_by = p_profile_id

    union all

    select
      game.accepted_at,
      'game_accepted',
      game.id,
      null::uuid,
      null::text,
      0
    from target_games game
    where game.accepted_at is not null
      and game.requested_by <> p_profile_id

    union all

    select
      round.created_at,
      'round_started',
      round.game_id,
      round.id,
      round.topic,
      0
    from public.word_game_rounds round
    join target_games game on game.id = round.game_id
    where round.explainer_id = p_profile_id

    union all

    select
      round.explained_at,
      'explanation_submitted',
      round.game_id,
      round.id,
      round.topic,
      coalesce(round.speaking_duration_seconds, 0)
    from public.word_game_rounds round
    join target_games game on game.id = round.game_id
    where round.explainer_id = p_profile_id
      and round.explained_at is not null

    union all

    select
      round.completed_at,
      'guess_submitted',
      round.game_id,
      round.id,
      round.topic,
      0
    from public.word_game_rounds round
    join target_games game on game.id = round.game_id
    where round.explainer_id <> p_profile_id
      and round.status = 'completed'
      and round.completed_at is not null

    union all

    select
      game.finished_at,
      'game_completed',
      game.id,
      null::uuid,
      null::text,
      0
    from target_games game
    where game.status = 'finished'
      and game.finished_at is not null
      and exists (
        select 1
        from public.word_game_rounds round
        where round.game_id = game.id
          and (round.transcript is not null or round.status = 'completed')
      )
  ),
  bounded_events as (
    select
      event.*,
      pg_catalog.timezone(activity_time_zone, event.occurred_at)::date as activity_date
    from events event
    where extract(year from pg_catalog.timezone(activity_time_zone, event.occurred_at)) = p_year
  ),
  daily as (
    select
      event.activity_date,
      count(*)::integer as interaction_count,
      count(*) filter (where event.kind = 'game_requested')::integer as games_requested,
      count(*) filter (where event.kind = 'game_accepted')::integer as games_accepted,
      count(*) filter (where event.kind = 'round_started')::integer as rounds_started,
      count(*) filter (where event.kind = 'explanation_submitted')::integer as explanations_submitted,
      count(*) filter (where event.kind = 'guess_submitted')::integer as guesses_submitted,
      count(*) filter (where event.kind = 'game_completed')::integer as games_completed,
      count(distinct event.game_id)::integer as games_played,
      coalesce(sum(event.speaking_duration_seconds), 0)::integer as speaking_duration_seconds,
      coalesce(
        array_agg(distinct event.topic order by event.topic) filter (where event.topic is not null),
        array[]::text[]
      ) as topics
    from bounded_events event
    group by event.activity_date
  ),
  totals as (
    select
      count(distinct event.activity_date)::integer as active_days,
      count(*)::integer as interaction_count,
      count(distinct event.game_id)::integer as games_played,
      count(*) filter (where event.kind = 'game_completed')::integer as games_completed,
      count(*) filter (where event.kind = 'round_started')::integer as rounds_started,
      count(*) filter (where event.kind = 'explanation_submitted')::integer as explanations_submitted,
      count(*) filter (where event.kind = 'guess_submitted')::integer as guesses_submitted,
      coalesce(sum(event.speaking_duration_seconds), 0)::integer as speaking_duration_seconds,
      count(distinct event.topic) filter (where event.topic is not null)::integer as topics_explored
    from bounded_events event
  )
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', target_profile.id,
      'username', target_profile.username,
      'displayName', target_profile.display_name,
      'avatarUrl', target_profile.avatar_url,
      'createdAt', target_profile.created_at,
      'timeZone', activity_time_zone
    ),
    'isOwner', requester_id = p_profile_id,
    'year', p_year,
    'timeZone', activity_time_zone,
    'totals', jsonb_build_object(
      'activeDays', totals.active_days,
      'interactionCount', totals.interaction_count,
      'gamesPlayed', totals.games_played,
      'gamesCompleted', totals.games_completed,
      'roundsStarted', totals.rounds_started,
      'explanationsSubmitted', totals.explanations_submitted,
      'guessesSubmitted', totals.guesses_submitted,
      'speakingDurationSeconds', totals.speaking_duration_seconds,
      'topicsExplored', totals.topics_explored
    ),
    'days', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', daily.activity_date,
          'interactionCount', daily.interaction_count,
          'intensity', case
            when daily.interaction_count < 5 then 1
            when daily.interaction_count < 10 then 2
            when daily.interaction_count < 20 then 3
            when daily.interaction_count < 35 then 4
            else 5
          end,
          'gamesRequested', daily.games_requested,
          'gamesAccepted', daily.games_accepted,
          'roundsStarted', daily.rounds_started,
          'explanationsSubmitted', daily.explanations_submitted,
          'guessesSubmitted', daily.guesses_submitted,
          'gamesCompleted', daily.games_completed,
          'gamesPlayed', daily.games_played,
          'speakingDurationSeconds', daily.speaking_duration_seconds,
          'topics', to_jsonb(daily.topics)
        ) order by daily.activity_date
      )
      from daily
    ), '[]'::jsonb)
  )
  into result
  from totals;

  return result;
end;
$$;

revoke execute on function public.get_profile_activity(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_profile_activity(uuid, integer) to authenticated;

comment on function public.get_profile_activity(uuid, integer) is
  'Returns owner-timezone activity aggregates to the profile owner or one of their active partners.';
