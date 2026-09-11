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

  if game_record.id is not null and game_record.status = 'finished' then
    delete from public.word_game_rounds where game_id = game_record.id;
    update public.word_games set
      status = 'pending',
      requested_by = requester_id,
      current_player_id = requester_id,
      accepted_at = null,
      inviter_last_seen_at = null,
      invitee_last_seen_at = null,
      presence_ready = false,
      paused_at = null,
      reconnect_deadline = null,
      disconnected_player_id = null,
      finished_at = null
    where id = game_record.id;
    return public.word_game_session_payload(game_record.id, requester_id);
  end if;

  if game_record.id is not null then
    return public.word_game_session_payload(game_record.id, requester_id);
  end if;

  insert into public.word_games(partnership_id, current_player_id, requested_by, status)
  values (p_partnership_id, requester_id, requester_id, 'pending')
  returning * into game_record;
  return public.word_game_session_payload(game_record.id, requester_id);
end;
$$;

comment on function public.start_word_game(uuid) is
  'Creates a game request or resets a finished game so the partnership can play again.';
