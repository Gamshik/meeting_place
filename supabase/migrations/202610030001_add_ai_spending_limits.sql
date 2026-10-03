-- These migrations have not been deployed. Limits live on the profile itself.
alter table public.profiles
  add column monthly_limit_usd numeric check (monthly_limit_usd >= 0 and monthly_limit_usd < 1000000000 and scale(monthly_limit_usd) <= 12),
  add column lifetime_limit_usd numeric check (lifetime_limit_usd >= 0 and lifetime_limit_usd < 1000000000 and scale(lifetime_limit_usd) <= 12);
-- Preserve ordinary profile reads without exposing the two admin-only columns.
revoke select on public.profiles from authenticated, anon;
grant select (id, username, display_name, avatar_url, created_at, updated_at, time_zone, is_admin)
  on public.profiles to authenticated;

create function public.admin_get_ai_limits(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_current_user_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  select jsonb_build_object('monthlyUsd', monthly_limit_usd::text, 'lifetimeUsd', lifetime_limit_usd::text)
    into result from public.profiles where id=p_user_id;
  if not found then raise exception 'profile_not_found' using errcode='P0002'; end if;
  return result;
end;
$$;
create function public.admin_set_ai_limits(p_user_id uuid, p_monthly_usd text, p_lifetime_usd text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_current_user_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if (p_monthly_usd is not null and p_monthly_usd !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,12})?$') or
     (p_lifetime_usd is not null and p_lifetime_usd !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,12})?$') then
    raise exception 'invalid_limits';
  end if;
  update public.profiles set monthly_limit_usd=p_monthly_usd::numeric, lifetime_limit_usd=p_lifetime_usd::numeric where id=p_user_id;
  if not found then raise exception 'profile_not_found' using errcode='P0002'; end if;
  return true;
end;
$$;
-- Only compares verified totals supplied by the Worker. Direct calls cannot initiate AI work.
create function public.check_my_ai_credits(p_lifetime_usd text, p_monthly_usd text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare profile public.profiles%rowtype;
begin
  if auth.uid() is null then return false; end if;
  if p_lifetime_usd is null or p_monthly_usd is null or
     p_lifetime_usd !~ '^[0-9]+(\.[0-9]{1,12})?$' or
     p_monthly_usd !~ '^[0-9]+(\.[0-9]{1,12})?$' then return false; end if;
  select * into profile from public.profiles where id=auth.uid();
  if not found then return false; end if;
  if profile.lifetime_limit_usd is not null and p_lifetime_usd::numeric >= profile.lifetime_limit_usd then return false; end if;
  return profile.monthly_limit_usd is null or p_monthly_usd::numeric < profile.monthly_limit_usd;
end;
$$;
revoke all on function public.admin_get_ai_limits(uuid), public.admin_set_ai_limits(uuid,text,text), public.check_my_ai_credits(text,text) from public, anon, authenticated;
grant execute on function public.admin_get_ai_limits(uuid), public.admin_set_ai_limits(uuid,text,text), public.check_my_ai_credits(text,text) to authenticated;
