-- Backend credential has no table access and cannot be assumed by API roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'word_card_writer') then
    create role word_card_writer login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end;
$$;

revoke execute on function public.cache_word_game_cards(uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.store_word_game_cards(text, text, jsonb)
  from public, anon, authenticated, word_card_writer;

create or replace function private.cache_word_game_cards(
  p_requester_id uuid,
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
  requester_id uuid := p_requester_id;
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


revoke all on function private.cache_word_game_cards(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant usage on schema private to word_card_writer;
grant execute on function private.cache_word_game_cards(uuid, uuid, text, text, jsonb)
  to word_card_writer;
-- Set a strong password outside migrations. Never grant this role to authenticator.
