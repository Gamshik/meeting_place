-- Accounting only: no quotas or price catalog. Retain usage across game deletion.
create table private.ai_usage_events (
  id uuid primary key,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null,
  operation text not null check (operation in ('cards','transcription')),
  token uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  receipt jsonb not null check (octet_length(receipt::text) <= 16000)
);
create index ai_usage_events_user_date on private.ai_usage_events(requester_id, created_at desc, id desc);
alter table private.ai_usage_events enable row level security;
revoke all on private.ai_usage_events from public, anon, authenticated, word_card_writer;

create function public.start_my_ai_usage(p_id uuid, p_job_id uuid, p_token uuid, p_receipt jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j private.game_ai_jobs%rowtype;
begin
  select * into j from private.game_ai_jobs where id=p_job_id and token=p_token
    and requester_id=auth.uid() and status='processing' and expires_at>clock_timestamp() for update;
  if j.id is null then return false; end if;
  insert into private.ai_usage_events(id, requester_id, game_id, operation, token, receipt)
    values(p_id, auth.uid(), j.game_id, j.operation, p_token, p_receipt)
    on conflict do nothing;
  return exists(select 1 from private.ai_usage_events where id=p_id and token=p_token and requester_id=auth.uid());
end;
$$;
create function public.record_my_ai_usage(p_id uuid, p_token uuid, p_receipt jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- A late provider response can still be accounted for after a lease expires.
  update private.ai_usage_events set receipt=p_receipt
    where id=p_id and token=p_token and requester_id=auth.uid();
  return found;
end;
$$;
create function public.list_my_ai_usage(p_from timestamptz, p_to timestamptz,
  p_before_created_at timestamptz default null, p_before_id uuid default null)
returns table(id uuid, requester_id uuid, game_id uuid, operation text, created_at timestamptz, receipt jsonb)
language sql stable security definer set search_path = '' as $$
  select e.id,e.requester_id,e.game_id,e.operation,e.created_at,e.receipt
  from private.ai_usage_events e where e.requester_id=auth.uid()
    and e.created_at>=p_from and e.created_at<p_to
    and (p_before_created_at is null or (e.created_at,e.id)<(p_before_created_at,p_before_id))
  order by e.created_at desc,e.id desc limit 101;
$$;
revoke all on function public.start_my_ai_usage(uuid,uuid,uuid,jsonb),
  public.record_my_ai_usage(uuid,uuid,jsonb), public.list_my_ai_usage(timestamptz,timestamptz,timestamptz,uuid)
  from public, anon;
grant execute on function public.start_my_ai_usage(uuid,uuid,uuid,jsonb),
  public.record_my_ai_usage(uuid,uuid,jsonb), public.list_my_ai_usage(timestamptz,timestamptz,timestamptz,uuid)
  to authenticated;
