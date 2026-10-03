create table private.ai_limit_defaults (
  id boolean primary key default true check (id),
  monthly_usd numeric not null default 0.20
    check (monthly_usd >= 0 and monthly_usd < 1000000000 and scale(monthly_usd) <= 12),
  lifetime_usd numeric not null default 0.20
    check (lifetime_usd >= 0 and lifetime_usd < 1000000000 and scale(lifetime_usd) <= 12)
);
insert into private.ai_limit_defaults(id) values (true);

alter table private.ai_limit_defaults enable row level security;
revoke all on private.ai_limit_defaults from public, anon, authenticated, word_card_writer;

create function private.copy_signup_ai_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select monthly_usd, lifetime_usd into new.monthly_limit_usd, new.lifetime_limit_usd
    from private.ai_limit_defaults where id;
  if not found then raise exception 'ai_limit_defaults_missing'; end if;
  return new;
end;
$$;
revoke all on function private.copy_signup_ai_limits() from public, anon, authenticated;
create trigger profiles_copy_signup_ai_limits before insert on public.profiles
for each row execute function private.copy_signup_ai_limits();
