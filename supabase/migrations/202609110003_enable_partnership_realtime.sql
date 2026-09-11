-- Realtime emits only rows visible through the existing participant RLS policy.
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
      and tablename = 'partnerships'
  ) then
    execute 'alter publication supabase_realtime add table public.partnerships';
  end if;
end;
$$;
