-- Acceptance is an age declaration and Terms acceptance, not blanket privacy consent.
create table private.legal_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  adult_declared boolean not null check (adult_declared),
  accepted_at timestamptz not null default clock_timestamp(),
  primary key (user_id, terms_version)
);
alter table private.legal_acceptances enable row level security;
revoke all on private.legal_acceptances from public, anon, authenticated;

create function public.has_accepted_current_terms()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.legal_acceptances
    where user_id = auth.uid() and terms_version = '2026-10-04' and adult_declared);
$$;
create function public.get_my_legal_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('accepted', public.has_accepted_current_terms(),
    'termsVersion', (select terms_version from private.legal_acceptances where user_id = auth.uid() order by accepted_at desc limit 1),
    'acceptedAt', (select accepted_at from private.legal_acceptances where user_id = auth.uid() order by accepted_at desc limit 1));
$$;
create function public.accept_my_terms(p_adult boolean, p_accept_terms boolean, p_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_adult is distinct from true or p_accept_terms is distinct from true
    or p_version is distinct from '2026-10-04' then
    raise exception using errcode = 'P0001', message = 'invalid_terms_acceptance';
  end if;
  insert into private.legal_acceptances(user_id, terms_version, adult_declared)
    values (auth.uid(), p_version, true) on conflict do nothing;
end;
$$;
revoke all on function public.has_accepted_current_terms(), public.get_my_legal_status(), public.accept_my_terms(boolean, boolean, text) from public, anon;
grant execute on function public.has_accepted_current_terms(), public.get_my_legal_status(), public.accept_my_terms(boolean, boolean, text) to authenticated;

-- Triggers also cover security-definer RPC mutations made directly through Supabase.
create function private.require_adult_terms()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.has_accepted_current_terms() then
    raise exception using errcode = 'P0001', message = 'terms_acceptance_required';
  end if;
  return new;
end;
$$;
create trigger require_adult_terms before insert or update on public.partnerships
for each row execute function private.require_adult_terms();
create trigger require_adult_terms before insert or update on public.word_games
for each row execute function private.require_adult_terms();
create trigger require_adult_terms before insert or update on public.word_game_rounds
for each row execute function private.require_adult_terms();
create trigger require_adult_terms before insert or update on private.game_ai_jobs
for each row execute function private.require_adult_terms();

-- Restrictive policies supplement the existing participant/ownership policies.
create policy "Recordings require adult Terms acceptance" on storage.objects
as restrictive for all to authenticated
using (bucket_id <> 'word-game-recordings' or public.has_accepted_current_terms())
with check (bucket_id <> 'word-game-recordings' or public.has_accepted_current_terms());
create policy "Expired recordings cannot be accessed" on storage.objects
as restrictive for select to authenticated
using (bucket_id <> 'word-game-recordings' or created_at > now() - interval '7 days');
create policy "Expired recordings cannot be replaced" on storage.objects
as restrictive for update to authenticated
using (bucket_id <> 'word-game-recordings' or created_at > now() - interval '7 days')
with check (bucket_id <> 'word-game-recordings' or created_at > now() - interval '7 days');
-- Do not recreate an expired object while the cleanup worker is deleting it.
create function public.recording_round_is_recent(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.word_game_rounds r
    where p_name = r.game_id::text || '/' || r.id::text || '.wav'
      and r.created_at > now() - interval '7 days');
$$;
revoke all on function public.recording_round_is_recent(text) from public, anon;
grant execute on function public.recording_round_is_recent(text) to authenticated;
create policy "Old rounds cannot receive recordings" on storage.objects
as restrictive for insert to authenticated
with check (bucket_id <> 'word-game-recordings' or public.recording_round_is_recent(name));

-- Read Storage metadata, but delete bytes only through the Storage API.
create function public.list_expired_recordings()
returns table(name text) language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
  where o.bucket_id = 'word-game-recordings' and o.created_at <= now() - interval '7 days'
  order by o.created_at, o.name limit 100;
$$;
create function public.clear_deleted_recording_paths()
returns void language sql security definer set search_path = '' as $$
  update public.word_game_rounds r set audio_path = null
  where r.audio_path is not null and r.created_at <= now() - interval '7 days'
    and not exists (select 1 from storage.objects o
      where o.bucket_id = 'word-game-recordings' and o.name = r.audio_path);
$$;
revoke all on function public.list_expired_recordings(), public.clear_deleted_recording_paths() from public, anon, authenticated;
grant execute on function public.list_expired_recordings(), public.clear_deleted_recording_paths() to service_role;
