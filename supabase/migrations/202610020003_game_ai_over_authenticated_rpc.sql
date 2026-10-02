-- HTTPS RPCs use the existing user session. Tokens are supplied by the Worker
-- and never returned by a lookup or a duplicate reservation.
alter table private.game_ai_jobs add column requester_id uuid;

create function public.reserve_my_game_ai(p_game_id uuid, p_round_id uuid,
  p_operation text, p_fingerprint text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  answer jsonb;
  requester uuid := auth.uid();
begin
  if requester is null or p_token is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  answer := private.reserve_game_ai(requester, p_game_id, p_round_id, p_operation, p_fingerprint);
  if answer->>'status' = 'reserved' then
    update private.game_ai_jobs set token = p_token, requester_id = requester
      where id = (answer->>'id')::uuid;
  end if;
  return answer - 'token';
end;
$$;

create function public.finish_my_game_ai(p_id uuid, p_token uuid, p_result jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  if not exists (select 1 from private.game_ai_jobs
    where id = p_id and requester_id = auth.uid() and token = p_token) then
    return false;
  end if;
  return private.finish_game_ai(p_id, p_token, p_result);
end;
$$;
revoke all on function public.reserve_my_game_ai(uuid, uuid, text, text, uuid),
  public.finish_my_game_ai(uuid, uuid, jsonb) from public, anon;
grant execute on function public.reserve_my_game_ai(uuid, uuid, text, text, uuid),
  public.finish_my_game_ai(uuid, uuid, jsonb) to authenticated;
