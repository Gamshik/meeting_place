-- Reservations and cached provider results are private to the Worker.
create table private.game_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.word_games(id) on delete cascade,
  operation text not null check (operation in ('cards', 'transcription')),
  turn_number integer not null,
  fingerprint text not null,
  token uuid not null,
  expires_at timestamptz not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  unique (game_id, operation, turn_number)
);
alter table private.game_ai_jobs enable row level security;
revoke all on private.game_ai_jobs from public, anon, authenticated, word_card_writer;

create function private.reserve_game_ai(
  p_requester_id uuid, p_game_id uuid, p_round_id uuid, p_operation text, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g record;
  r public.word_game_rounds%rowtype;
  j private.game_ai_jobs%rowtype;
  next_turn integer;
  now_at timestamptz;
begin
  select game.*, partnership.status as partnership_status,
    partnership.inviter_id, partnership.invitee_id into g
  from public.word_games game join public.partnerships partnership on partnership.id = game.partnership_id
  where game.id = p_game_id for update of game;
  if p_requester_id is null or g.id is null
    or p_requester_id not in (g.inviter_id, g.invitee_id)
    or g.partnership_status <> 'active' or g.status <> 'active'
    or g.current_player_id <> p_requester_id
    or p_operation is null or p_operation not in ('cards', 'transcription')
    or p_fingerprint is null or length(p_fingerprint) not between 1 and 128 then
    return jsonb_build_object('status', 'conflict');
  end if;
  select * into r from public.word_game_rounds where game_id = p_game_id
    order by turn_number desc limit 1;
  if r.id is distinct from p_round_id then
    return jsonb_build_object('status', 'conflict');
  end if;
  if p_operation = 'cards' then
    if r.status in ('explaining', 'awaiting_guess') then
      return jsonb_build_object('status', 'conflict');
    end if;
    next_turn := coalesce(r.turn_number, 0) + 1;
  else
    if r.id is null or g.mode <> 'recorded' or r.status <> 'explaining'
      or r.explainer_id <> p_requester_id or r.recording_started_at is null
      or r.recording_finished_at is null then
      return jsonb_build_object('status', 'conflict');
    end if;
    next_turn := r.turn_number;
  end if;
  -- The game row serializes all attempts, including different topics for the same turn.
  now_at := clock_timestamp();
  -- Drop cached content from earlier turns when a new action is requested.
  delete from private.game_ai_jobs where game_id = p_game_id and turn_number < next_turn;
  select * into j from private.game_ai_jobs
    where game_id = p_game_id and operation = p_operation and turn_number = next_turn for update;
  if j.status = 'processing' and j.expires_at > now_at then
    return jsonb_build_object('status', 'processing', 'retryAfter',
      greatest(1, ceil(extract(epoch from j.expires_at - now_at))::integer));
  end if;
  if j.status = 'completed' then
    if j.fingerprint <> p_fingerprint then
      return jsonb_build_object('status', 'conflict');
    end if;
    return jsonb_build_object('status', 'cached', 'result', j.result);
  end if;
  insert into private.game_ai_jobs(game_id, operation, turn_number, fingerprint, token, expires_at, status)
    values (p_game_id, p_operation, next_turn, p_fingerprint, gen_random_uuid(), now_at + interval '2 minutes', 'processing')
    on conflict (game_id, operation, turn_number) do update
      set fingerprint = excluded.fingerprint, token = excluded.token, expires_at = excluded.expires_at,
        status = 'processing', result = null
    returning * into j;
  return jsonb_build_object('status', 'reserved', 'id', j.id, 'token', j.token);
end;
$$;

create function private.finish_game_ai(p_id uuid, p_token uuid, p_result jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_result is not null and octet_length(p_result::text) > 1000000 then
    raise exception 'ai_result_too_large';
  end if;
  update private.game_ai_jobs set result = p_result,
    status = case when p_result is null then 'failed' else 'completed' end
  where id = p_id and token = p_token and status = 'processing' and expires_at > clock_timestamp();
  return found;
end;
$$;
revoke all on function private.reserve_game_ai(uuid, uuid, uuid, text, text),
  private.finish_game_ai(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.reserve_game_ai(uuid, uuid, uuid, text, text),
  private.finish_game_ai(uuid, uuid, jsonb) to word_card_writer;
