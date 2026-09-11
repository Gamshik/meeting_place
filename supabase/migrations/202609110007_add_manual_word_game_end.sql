create or replace function public.end_word_game(p_partnership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
begin
  update public.word_games game set
    status = 'finished',
    finished_at = clock_timestamp(),
    paused_at = null,
    reconnect_deadline = null,
    disconnected_player_id = null
  from public.partnerships partnership
  where game.partnership_id = p_partnership_id
    and partnership.id = game.partnership_id
    and partnership.status = 'active'
    and requester_id in (partnership.inviter_id, partnership.invitee_id)
    and game.status in ('active', 'paused');

  if requester_id is null or not found then
    raise exception using errcode = 'P0001', message = 'word_game_end_not_available';
  end if;
end;
$$;

revoke execute on function public.end_word_game(uuid) from public, anon, authenticated;
grant execute on function public.end_word_game(uuid) to authenticated;

comment on function public.end_word_game(uuid) is
  'Immediately finishes an active or paused game when requested by either participant.';
