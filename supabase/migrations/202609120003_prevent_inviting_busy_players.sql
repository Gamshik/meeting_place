create or replace function public.start_word_game(p_partnership_id uuid)
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

  insert into public.word_games(partnership_id, current_player_id, requested_by, status)
  values (p_partnership_id, requester_id, requester_id, 'pending')
  returning * into game_record;

  return public.word_game_session_payload(game_record.id, requester_id);
end;
$$;

comment on function public.start_word_game(uuid) is
  'Creates a game request only when both participants are free from another active or paused game.';
