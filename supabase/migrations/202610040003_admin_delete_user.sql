-- Keep game IDs after account cascades so even in-flight uploads can be cleaned up.
create table private.deleted_recording_games (
  game_id uuid primary key,
  deleted_at timestamptz not null default clock_timestamp()
);
alter table private.deleted_recording_games enable row level security;
revoke all on private.deleted_recording_games from public, anon, authenticated;

create function public.admin_delete_user(p_user_id uuid, p_username text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.profiles%rowtype;
begin
  if not public.is_current_user_admin() or not public.has_accepted_current_terms() then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select * into target from public.profiles where id=p_user_id for update;
  if not found then return true; end if;
  if target.is_admin or p_user_id=auth.uid() then
    raise exception 'admin_account_protected' using errcode='P0001';
  end if;
  if p_username is distinct from target.username then
    raise exception 'user_confirmation_mismatch' using errcode='P0001';
  end if;
  -- Lock partnerships before enumerating games: new games reference these rows.
  perform 1 from public.partnerships where p_user_id in (inviter_id,invitee_id) for update;
  perform 1 from public.word_games g join public.partnerships p on p.id=g.partnership_id
    where p_user_id in (p.inviter_id,p.invitee_id) for update of g;
  insert into private.deleted_recording_games(game_id)
    select g.id from public.word_games g join public.partnerships p on p.id=g.partnership_id
    where p_user_id in (p.inviter_id,p.invitee_id)
    on conflict do nothing;
  -- Identity, profile and dependent application records are removed in one transaction.
  delete from auth.users where id=p_user_id;
  return true;
end;
$$;
revoke all on function public.admin_delete_user(uuid,text) from public, anon;
grant execute on function public.admin_delete_user(uuid,text) to authenticated;

create or replace function public.list_expired_recordings()
returns table(name text) language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
  where o.bucket_id='word-game-recordings' and (
    o.created_at <= now()-interval '7 days' or exists (
      select 1 from private.deleted_recording_games d
      where split_part(o.name,'/',1)=d.game_id::text
    )
  ) order by o.created_at,o.name limit 100;
$$;
-- Tombstones remain for late uploads; they contain only game IDs, not user data.
