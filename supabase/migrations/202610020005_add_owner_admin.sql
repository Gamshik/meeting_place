alter table public.profiles add column is_admin boolean not null default false;
create unique index profiles_single_admin on public.profiles (is_admin) where is_admin;
-- Existing column-level UPDATE grants intentionally exclude is_admin.

create function public.is_current_user_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_admin);
$$;

create function public.admin_list_users(p_after_id uuid default null)
returns table(id uuid, username text, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return query select p.id, p.username, p.display_name from public.profiles p
    where p_after_id is null or p.id > p_after_id order by p.id limit 21;
end;
$$;

create function public.admin_list_usage(p_user_ids uuid[], p_from timestamptz,
  p_to timestamptz, p_after_id uuid default null)
returns table(id uuid, requester_id uuid, game_id uuid, operation text, created_at timestamptz, receipt jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if cardinality(p_user_ids) > 20 or p_from >= p_to then
    raise exception 'invalid_report_request';
  end if;
  return query select e.id, e.requester_id, e.game_id, e.operation, e.created_at, e.receipt
    from private.ai_usage_events e
    where e.requester_id = any(p_user_ids) and e.created_at >= p_from and e.created_at < p_to
      and (p_after_id is null or e.id > p_after_id)
    order by e.id limit 501;
end;
$$;

revoke all on function public.is_current_user_admin(), public.admin_list_users(uuid),
  public.admin_list_usage(uuid[],timestamptz,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.is_current_user_admin(), public.admin_list_users(uuid),
  public.admin_list_usage(uuid[],timestamptz,timestamptz,uuid) to authenticated;
