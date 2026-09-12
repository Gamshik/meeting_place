create policy "Participants can receive word game updates"
on public.word_games
for select
to authenticated
using (
  exists (
    select 1
    from public.partnerships partnership
    where partnership.id = word_games.partnership_id
      and auth.uid() in (partnership.inviter_id, partnership.invitee_id)
  )
);

grant select on table public.word_games to authenticated;

-- Realtime only publishes rows visible through the participant policy above.
-- The guards keep lightweight PostgreSQL test environments compatible when the
-- Supabase-managed publication is not present.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'word_games'
  ) then
    execute 'alter publication supabase_realtime add table public.word_games';
  end if;
end;
$$;
