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
  where round.id = p_round_id
  for update of round;

  if requester_id is null or round_record.id is null
    or round_record.game_status <> 'active'
    or round_record.explainer_id <> requester_id
    or round_record.status not in ('explaining', 'awaiting_guess')
    or round_record.partnership_status <> 'active'
    or requester_id not in (round_record.inviter_id, round_record.invitee_id) then
    raise exception using errcode = 'P0001', message = 'word_game_skip_not_available';
  end if;

  next_player_id := case when requester_id = round_record.inviter_id
    then round_record.invitee_id else round_record.inviter_id end;

  update public.word_game_rounds
  set status = 'skipped', is_correct = false, score = 0, completed_at = now()
  where id = p_round_id;

  update public.word_games
  set current_player_id = next_player_id
  where id = round_record.game_id;

  return public.word_game_state_payload(round_record.game_id, requester_id);
end;
$$;

revoke execute on function public.skip_word_game_round(uuid) from public, anon, authenticated;
grant execute on function public.skip_word_game_round(uuid) to authenticated;

comment on function public.skip_word_game_round(uuid) is
  'Lets the current explainer skip an active recorded or live-call round.';
