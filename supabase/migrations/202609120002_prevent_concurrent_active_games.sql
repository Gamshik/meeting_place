create or replace function public.respond_to_word_game(p_game_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  partner_id uuid;
  game_record record;
begin
  select game.*, partnership.inviter_id, partnership.invitee_id,
    partnership.status as partnership_status
  into game_record
  from public.word_games game
  join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = p_game_id
  for update of game;

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

  -- Serialize acceptances for both players. This prevents two requests involving
  -- the same person from becoming active at the same time.
  perform profile.id
  from public.profiles profile
  where profile.id in (game_record.inviter_id, game_record.invitee_id)
  order by profile.id
  for update;

  partner_id := case
    when requester_id = game_record.inviter_id then game_record.invitee_id
    else game_record.inviter_id
  end;

  if exists (
    select 1
    from public.word_games other_game
    join public.partnerships other_partnership
      on other_partnership.id = other_game.partnership_id
    where other_game.id <> p_game_id
      and other_game.status in ('active', 'paused')
      and requester_id in (other_partnership.inviter_id, other_partnership.invitee_id)
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_player_busy';
  end if;

  if exists (
    select 1
    from public.word_games other_game
    join public.partnerships other_partnership
      on other_partnership.id = other_game.partnership_id
    where other_game.id <> p_game_id
      and other_game.status in ('active', 'paused')
      and partner_id in (other_partnership.inviter_id, other_partnership.invitee_id)
  ) then
    raise exception using errcode = 'P0001', message = 'word_game_partner_busy';
  end if;

  update public.word_games
  set status = 'active', accepted_at = now()
  where id = p_game_id;

  return public.word_game_state_payload(p_game_id, requester_id);
end;
$$;

comment on function public.respond_to_word_game(uuid, boolean) is
  'Accepts a pending game only when both participants are free from another active or paused game.';
