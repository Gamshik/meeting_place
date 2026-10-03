import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('repairs a legacy database without deleting saved policies and permits authenticated admin reads', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
      create function public.is_current_user_admin() returns boolean language sql as $$select true$$;
      create table public.profiles(id uuid primary key, username text, display_name text, avatar_url text, created_at timestamptz, updated_at timestamptz, time_zone text, is_admin boolean);
      grant select on public.profiles to authenticated;
      insert into public.profiles(id) values('11111111-1111-4111-8111-111111111111');
      create table private.ai_limit_policies(user_id uuid, policy jsonb);
      insert into private.ai_limit_policies values('11111111-1111-4111-8111-111111111111','{"ciphertext":"preserve"}');
    `)
    const sql = await readFile(
      'supabase/migrations/202610030003_repair_profile_limit_schema.sql',
      'utf8',
    )
    await db.exec(sql)
    await db.exec(sql)
    expect((await db.query('select policy from private.ai_limit_policies')).rows).toEqual([
      { policy: { ciphertext: 'preserve' } },
    ])
    await db.exec('set role authenticated')
    expect(
      (
        await db.query(
          "select public.admin_get_ai_limits('11111111-1111-4111-8111-111111111111') as limits",
        )
      ).rows,
    ).toEqual([{ limits: { monthlyUsd: null, lifetimeUsd: null } }])
    await db.exec(
      "select public.admin_set_ai_limits('11111111-1111-4111-8111-111111111111','0.2','1')",
    )
    expect(
      (
        await db.query(
          "select public.admin_get_ai_limits('11111111-1111-4111-8111-111111111111') as limits",
        )
      ).rows,
    ).toEqual([{ limits: { monthlyUsd: '0.2', lifetimeUsd: '1' } }])
    await expect(db.query('select monthly_limit_usd from public.profiles')).rejects.toThrow(
      /permission denied/,
    )
  } finally {
    await db.close()
  }
})
