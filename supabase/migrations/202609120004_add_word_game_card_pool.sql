create table public.word_game_cards (
  id uuid primary key default extensions.gen_random_uuid(),
  topic text not null check (char_length(topic) between 2 and 40),
  word text not null check (char_length(word) between 2 and 60),
  normalized_word text not null unique check (char_length(normalized_word) between 2 and 60),
  accepted_answers text[] not null check (cardinality(accepted_answers) between 1 and 8),
  forbidden_words text[] not null check (cardinality(forbidden_words) between 1 and 12),
  difficulty text not null default 'B1-B2' check (difficulty in ('B1-B2')),
  source_model text not null check (char_length(source_model) between 1 and 120),
  is_active boolean not null default true,
  times_used integer not null default 0 check (times_used >= 0),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.word_game_card_answers (
  card_id uuid not null references public.word_game_cards (id) on delete cascade,
  answer text not null check (char_length(answer) between 2 and 60),
  normalized_answer text not null unique check (char_length(normalized_answer) between 2 and 60),
  primary key (card_id, normalized_answer)
);

create table public.word_game_card_exposures (
  card_id uuid not null references public.word_game_cards (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  times_seen integer not null default 1 check (times_seen > 0),
  primary key (card_id, profile_id)
);

alter table public.word_game_rounds
  add column card_id uuid references public.word_game_cards (id) on delete set null;

create index word_game_cards_topic_selection_idx
  on public.word_game_cards (lower(topic), is_active, times_used, last_used_at);

create index word_game_card_exposures_profile_idx
  on public.word_game_card_exposures (profile_id, last_seen_at desc);

alter table public.word_game_cards enable row level security;
alter table public.word_game_card_answers enable row level security;
alter table public.word_game_card_exposures enable row level security;

revoke all on table public.word_game_cards from public, anon, authenticated;
revoke all on table public.word_game_card_answers from public, anon, authenticated;
revoke all on table public.word_game_card_exposures from public, anon, authenticated;

create or replace function public.store_word_game_cards(
  p_topic text,
  p_source_model text,
  p_cards jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate jsonb;
  candidate_id uuid;
  candidate_word text;
  candidate_answers text[];
  candidate_forbidden text[];
  candidate_aliases text[];
  inserted_count integer := 0;
begin
  if char_length(trim(coalesce(p_topic, ''))) not between 2 and 40
    or char_length(trim(coalesce(p_source_model, ''))) not between 1 and 120
    or jsonb_typeof(p_cards) <> 'array'
    or jsonb_array_length(p_cards) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid_word_game_card_batch';
  end if;

  <<candidate_loop>>
  for candidate in select value from jsonb_array_elements(p_cards)
  loop
    begin
      if jsonb_typeof(candidate) <> 'object'
        or jsonb_typeof(candidate -> 'acceptedAnswers') <> 'array'
        or jsonb_typeof(candidate -> 'forbiddenWords') <> 'array' then
        continue candidate_loop;
      end if;

      candidate_word := lower(trim(candidate ->> 'word'));
      candidate_answers := array(
        select distinct lower(trim(value))
        from jsonb_array_elements_text(candidate -> 'acceptedAnswers')
        where trim(value) <> ''
      );
      candidate_forbidden := array(
        select distinct lower(trim(value))
        from jsonb_array_elements_text(candidate -> 'forbiddenWords')
        where trim(value) <> ''
      );
      candidate_answers := array(
        select distinct value from unnest(array_prepend(candidate_word, candidate_answers)) value
      );
      candidate_forbidden := array(
        select distinct value from unnest(array_prepend(candidate_word, candidate_forbidden)) value
      );

      if candidate_word is null
        or char_length(candidate_word) not between 2 and 60
        or candidate_word !~ '^[a-z][a-z ''-]*$'
        or cardinality(candidate_answers) not between 1 and 8
        or cardinality(candidate_forbidden) not between 1 and 12
        or exists (
          select 1 from unnest(candidate_answers || candidate_forbidden) phrase
          where char_length(phrase) not between 2 and 60
            or phrase !~ '^[a-z][a-z ''-]*$'
        ) then
        continue candidate_loop;
      end if;

      candidate_aliases := array(
        select distinct public.normalize_game_phrase(value)
        from unnest(candidate_answers) value
      );
      if exists (
        select 1 from public.word_game_card_answers answer
        where answer.normalized_answer = any(candidate_aliases)
      ) then
        continue candidate_loop;
      end if;

      candidate_id := null;
      insert into public.word_game_cards(
        topic, word, normalized_word, accepted_answers, forbidden_words, source_model
      ) values (
        trim(p_topic), candidate_word, public.normalize_game_phrase(candidate_word),
        candidate_answers, candidate_forbidden, trim(p_source_model)
      )
      on conflict (normalized_word) do nothing
      returning id into candidate_id;

      if candidate_id is null then
        continue candidate_loop;
      end if;

      insert into public.word_game_card_answers(card_id, answer, normalized_answer)
      select candidate_id, min(value), public.normalize_game_phrase(value)
      from unnest(candidate_answers) value
      group by public.normalize_game_phrase(value);
      inserted_count := inserted_count + 1;
    exception when unique_violation then
      -- The nested block rolls back this candidate while preserving the rest of the batch.
      null;
    end;
  end loop;

  return inserted_count;
end;
$$;

revoke execute on function public.store_word_game_cards(text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.cache_word_game_cards(
  p_game_id uuid,
  p_topic text,
  p_source_model text,
  p_cards jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_record record;
begin
  select game.*, partnership.status as partnership_status,
    partnership.inviter_id, partnership.invitee_id
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = p_game_id
  for update of game;

  if requester_id is null or game_record.id is null
    or requester_id not in (game_record.inviter_id, game_record.invitee_id)
    or game_record.partnership_status <> 'active'
    or game_record.status <> 'active'
    or game_record.current_player_id <> requester_id then
    raise exception using errcode = 'P0001', message = 'word_game_turn_not_available';
  end if;
  if exists (
    select 1 from public.word_game_rounds
    where game_id = p_game_id and status in ('explaining', 'awaiting_guess')
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_round_in_progress';
  end if;

  return public.store_word_game_cards(p_topic, p_source_model, p_cards);
end;
$$;

create or replace function public.list_word_game_card_exclusions(
  p_game_id uuid,
  p_topic text,
  p_limit integer default 200
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_record record;
  excluded_words text[];
begin
  select game.*, partnership.status as partnership_status,
    partnership.inviter_id, partnership.invitee_id
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = p_game_id;

  if requester_id is null or game_record.id is null
    or requester_id not in (game_record.inviter_id, game_record.invitee_id)
    or game_record.partnership_status <> 'active'
    or game_record.status <> 'active'
    or game_record.current_player_id <> requester_id
    or p_limit not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'word_game_turn_not_available';
  end if;

  select coalesce(array_agg(recent.word order by recent.last_seen_at desc), '{}'::text[])
  into excluded_words
  from (
    select card.word, max(exposure.last_seen_at) as last_seen_at
    from public.word_game_cards card
    join public.word_game_card_exposures exposure on exposure.card_id = card.id
    where lower(card.topic) = lower(trim(p_topic))
      and exposure.profile_id in (game_record.inviter_id, game_record.invitee_id)
    group by card.id, card.word
    order by max(exposure.last_seen_at) desc
    limit p_limit
  ) recent;

  return excluded_words;
end;
$$;

create or replace function public.create_word_game_round_from_pool(
  p_game_id uuid,
  p_topic text,
  p_allow_seen boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  game_record record;
  card_record record;
  next_turn integer;
  selection_time timestamptz := now();
begin
  select game.*, partnership.status as partnership_status,
    partnership.inviter_id, partnership.invitee_id
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = p_game_id
  for update of game;

  if requester_id is null or game_record.id is null
    or requester_id not in (game_record.inviter_id, game_record.invitee_id)
    or game_record.partnership_status <> 'active'
    or game_record.status <> 'active'
    or game_record.current_player_id <> requester_id then
    raise exception using errcode = 'P0001', message = 'word_game_turn_not_available';
  end if;
  if exists (
    select 1 from public.word_game_rounds
    where game_id = p_game_id and status in ('explaining', 'awaiting_guess')
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_round_in_progress';
  end if;

  if not coalesce(p_allow_seen, false) then
    select card.* into card_record
    from public.word_game_cards card
    where card.is_active
      and lower(card.topic) = lower(trim(p_topic))
      and not exists (
        select 1 from public.word_game_card_exposures exposure
        where exposure.card_id = card.id
          and exposure.profile_id in (game_record.inviter_id, game_record.invitee_id)
      )
    order by card.times_used, random()
    limit 1
    for update of card skip locked;
  else
    select card.* into card_record
    from public.word_game_cards card
    where card.is_active
      and lower(card.topic) = lower(trim(p_topic))
    order by (
      select max(exposure.last_seen_at)
      from public.word_game_card_exposures exposure
      where exposure.card_id = card.id
        and exposure.profile_id in (game_record.inviter_id, game_record.invitee_id)
    ) asc nulls first, card.times_used, random()
    limit 1
    for update of card skip locked;
  end if;

  if card_record.id is null then
    return null;
  end if;

  select coalesce(max(turn_number), 0) + 1 into next_turn
  from public.word_game_rounds where game_id = p_game_id;

  insert into public.word_game_rounds(
    game_id, turn_number, explainer_id, topic, secret_word,
    accepted_answers, forbidden_words, card_id
  ) values (
    p_game_id, next_turn, requester_id, card_record.topic, card_record.word,
    card_record.accepted_answers, card_record.forbidden_words, card_record.id
  );

  insert into public.word_game_card_exposures(
    card_id, profile_id, first_seen_at, last_seen_at, times_seen
  ) values
    (card_record.id, game_record.inviter_id, selection_time, selection_time, 1),
    (card_record.id, game_record.invitee_id, selection_time, selection_time, 1)
  on conflict (card_id, profile_id) do update set
    last_seen_at = excluded.last_seen_at,
    times_seen = public.word_game_card_exposures.times_seen + 1;

  update public.word_game_cards set
    times_used = times_used + 1,
    last_used_at = selection_time
  where id = card_record.id;

  return public.word_game_state_payload(p_game_id, requester_id);
end;
$$;

revoke execute on function public.cache_word_game_cards(uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.list_word_game_card_exclusions(uuid, text, integer)
  from public, anon, authenticated;
revoke execute on function public.create_word_game_round_from_pool(uuid, text, boolean)
  from public, anon, authenticated;

grant execute on function public.cache_word_game_cards(uuid, text, text, jsonb) to authenticated;
grant execute on function public.list_word_game_card_exclusions(uuid, text, integer) to authenticated;
grant execute on function public.create_word_game_round_from_pool(uuid, text, boolean) to authenticated;

-- Preserve knowledge of cards and exposure from games that predate the shared pool.
do $$
declare
  historical record;
begin
  for historical in
    select distinct on (public.normalize_game_phrase(round.secret_word))
      round.topic, round.secret_word, round.accepted_answers, round.forbidden_words
    from public.word_game_rounds round
    order by public.normalize_game_phrase(round.secret_word), round.created_at
  loop
    perform public.store_word_game_cards(
      historical.topic,
      'historical-backfill',
      jsonb_build_array(jsonb_build_object(
        'word', historical.secret_word,
        'acceptedAnswers', to_jsonb(historical.accepted_answers),
        'forbiddenWords', to_jsonb(historical.forbidden_words)
      ))
    );
  end loop;
end;
$$;

select public.store_word_game_cards(
  seed.topic,
  'curated-seed',
  jsonb_agg(jsonb_build_object(
    'word', seed.word,
    'acceptedAnswers', to_jsonb(seed.accepted_answers),
    'forbiddenWords', to_jsonb(seed.forbidden_words)
  ))
)
from (values
  ('Everyday life', 'umbrella', array['umbrella', 'umbrellas'], array['umbrella', 'umbrellas']),
  ('Everyday life', 'refrigerator', array['refrigerator', 'refrigerators', 'fridge', 'fridges'], array['refrigerator', 'refrigerators', 'fridge', 'fridges']),
  ('Everyday life', 'appointment', array['appointment', 'appointments'], array['appointment', 'appointments']),
  ('Everyday life', 'wallet', array['wallet', 'wallets'], array['wallet', 'wallets']),
  ('Everyday life', 'laundry', array['laundry'], array['laundry']),
  ('Everyday life', 'elevator', array['elevator', 'elevators', 'lift', 'lifts'], array['elevator', 'elevators', 'lift', 'lifts']),
  ('Everyday life', 'calendar', array['calendar', 'calendars'], array['calendar', 'calendars']),
  ('Everyday life', 'toothpaste', array['toothpaste'], array['toothpaste']),
  ('Everyday life', 'traffic jam', array['traffic jam', 'traffic jams'], array['traffic jam', 'traffic jams']),
  ('Everyday life', 'neighbor', array['neighbor', 'neighbors', 'neighbour', 'neighbours'], array['neighbor', 'neighbors', 'neighbour', 'neighbours']),
  ('Food', 'avocado', array['avocado', 'avocados'], array['avocado', 'avocados']),
  ('Food', 'recipe', array['recipe', 'recipes'], array['recipe', 'recipes']),
  ('Food', 'ingredient', array['ingredient', 'ingredients'], array['ingredient', 'ingredients']),
  ('Food', 'bakery', array['bakery', 'bakeries'], array['bakery', 'bakeries']),
  ('Food', 'mushroom', array['mushroom', 'mushrooms'], array['mushroom', 'mushrooms']),
  ('Food', 'dessert', array['dessert', 'desserts'], array['dessert', 'desserts']),
  ('Food', 'saucepan', array['saucepan', 'saucepans'], array['saucepan', 'saucepans']),
  ('Food', 'lemonade', array['lemonade'], array['lemonade']),
  ('Food', 'sandwich', array['sandwich', 'sandwiches'], array['sandwich', 'sandwiches']),
  ('Food', 'appetite', array['appetite', 'appetites'], array['appetite', 'appetites']),
  ('Travel', 'passport', array['passport', 'passports'], array['passport', 'passports']),
  ('Travel', 'suitcase', array['suitcase', 'suitcases'], array['suitcase', 'suitcases']),
  ('Travel', 'boarding pass', array['boarding pass', 'boarding passes'], array['boarding pass', 'boarding passes']),
  ('Travel', 'campsite', array['campsite', 'campsites'], array['campsite', 'campsites']),
  ('Travel', 'souvenir', array['souvenir', 'souvenirs'], array['souvenir', 'souvenirs']),
  ('Travel', 'destination', array['destination', 'destinations'], array['destination', 'destinations']),
  ('Travel', 'ferry', array['ferry', 'ferries'], array['ferry', 'ferries']),
  ('Travel', 'luggage', array['luggage'], array['luggage']),
  ('Travel', 'hostel', array['hostel', 'hostels'], array['hostel', 'hostels']),
  ('Travel', 'landmark', array['landmark', 'landmarks'], array['landmark', 'landmarks']),
  ('Nature', 'waterfall', array['waterfall', 'waterfalls'], array['waterfall', 'waterfalls']),
  ('Nature', 'thunderstorm', array['thunderstorm', 'thunderstorms'], array['thunderstorm', 'thunderstorms']),
  ('Nature', 'butterfly', array['butterfly', 'butterflies'], array['butterfly', 'butterflies']),
  ('Nature', 'volcano', array['volcano', 'volcanoes'], array['volcano', 'volcanoes']),
  ('Nature', 'forest', array['forest', 'forests'], array['forest', 'forests']),
  ('Nature', 'rainbow', array['rainbow', 'rainbows'], array['rainbow', 'rainbows']),
  ('Nature', 'desert', array['desert', 'deserts'], array['desert', 'deserts']),
  ('Nature', 'earthquake', array['earthquake', 'earthquakes'], array['earthquake', 'earthquakes']),
  ('Nature', 'glacier', array['glacier', 'glaciers'], array['glacier', 'glaciers']),
  ('Nature', 'island', array['island', 'islands'], array['island', 'islands']),
  ('Work and study', 'deadline', array['deadline', 'deadlines'], array['deadline', 'deadlines']),
  ('Work and study', 'homework', array['homework'], array['homework']),
  ('Work and study', 'colleague', array['colleague', 'colleagues', 'coworker', 'coworkers'], array['colleague', 'colleagues', 'coworker', 'coworkers']),
  ('Work and study', 'presentation', array['presentation', 'presentations'], array['presentation', 'presentations']),
  ('Work and study', 'textbook', array['textbook', 'textbooks'], array['textbook', 'textbooks']),
  ('Work and study', 'interview', array['interview', 'interviews'], array['interview', 'interviews']),
  ('Work and study', 'laboratory', array['laboratory', 'laboratories', 'lab', 'labs'], array['laboratory', 'laboratories', 'lab', 'labs']),
  ('Work and study', 'timetable', array['timetable', 'timetables', 'schedule', 'schedules'], array['timetable', 'timetables', 'schedule', 'schedules']),
  ('Work and study', 'assignment', array['assignment', 'assignments'], array['assignment', 'assignments']),
  ('Work and study', 'certificate', array['certificate', 'certificates'], array['certificate', 'certificates']),
  ('Technology', 'smartphone', array['smartphone', 'smartphones'], array['smartphone', 'smartphones']),
  ('Technology', 'password', array['password', 'passwords'], array['password', 'passwords']),
  ('Technology', 'website', array['website', 'websites'], array['website', 'websites']),
  ('Technology', 'headphones', array['headphones'], array['headphones']),
  ('Technology', 'battery', array['battery', 'batteries'], array['battery', 'batteries']),
  ('Technology', 'download', array['download', 'downloads'], array['download', 'downloads']),
  ('Technology', 'video call', array['video call', 'video calls'], array['video call', 'video calls']),
  ('Technology', 'touchscreen', array['touchscreen', 'touchscreens', 'touch screen', 'touch screens'], array['touchscreen', 'touchscreens', 'touch screen', 'touch screens']),
  ('Technology', 'printer', array['printer', 'printers'], array['printer', 'printers']),
  ('Technology', 'robot', array['robot', 'robots'], array['robot', 'robots'])
) as seed(topic, word, accepted_answers, forbidden_words)
group by seed.topic;

update public.word_game_rounds round
set card_id = answer.card_id
from public.word_game_card_answers answer
where answer.normalized_answer = public.normalize_game_phrase(round.secret_word);

insert into public.word_game_card_exposures(
  card_id, profile_id, first_seen_at, last_seen_at, times_seen
)
select round.card_id, participant.profile_id, min(round.created_at), max(round.created_at), count(*)
from public.word_game_rounds round
join public.word_games game on game.id = round.game_id
join public.partnerships partnership on partnership.id = game.partnership_id
cross join lateral (
  values (partnership.inviter_id), (partnership.invitee_id)
) participant(profile_id)
where round.card_id is not null
group by round.card_id, participant.profile_id
on conflict (card_id, profile_id) do update set
  first_seen_at = least(public.word_game_card_exposures.first_seen_at, excluded.first_seen_at),
  last_seen_at = greatest(public.word_game_card_exposures.last_seen_at, excluded.last_seen_at),
  times_seen = public.word_game_card_exposures.times_seen + excluded.times_seen;

update public.word_game_cards card
set times_used = usage.times_used,
  last_used_at = usage.last_used_at
from (
  select round.card_id, count(*)::integer as times_used, max(round.created_at) as last_used_at
  from public.word_game_rounds round
  where round.card_id is not null
  group by round.card_id
) usage
where card.id = usage.card_id;

comment on table public.word_game_cards is
  'Validated reusable explain-the-word cards populated from AI batches and historical rounds.';
comment on table public.word_game_card_exposures is
  'Per-player card exposure ledger used to avoid showing either participant a known word.';
comment on function public.create_word_game_round_from_pool(uuid, text, boolean) is
  'Atomically selects a pooled card, snapshots it into a round, and records both participants exposure.';
