import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('does not backfill users registered before the signup-defaults migration', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role word_card_writer;
      create schema private; create schema auth;
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create function public.is_current_user_admin() returns boolean language sql as $$select true$$;
      create table public.profiles(id uuid primary key, monthly_limit_usd numeric, lifetime_limit_usd numeric);
      insert into public.profiles(id,monthly_limit_usd,lifetime_limit_usd) values ('11111111-1111-4111-8111-111111111111',null,null), ('22222222-2222-4222-8222-222222222222',5,10);
    `)
    await db.exec(
      await readFile('supabase/migrations/202610030002_copy_signup_ai_limits.sql', 'utf8'),
    )
    expect(
      (
        await db.query(
          'select monthly_limit_usd,lifetime_limit_usd from public.profiles order by id',
        )
      ).rows,
    ).toEqual([
      { monthly_limit_usd: null, lifetime_limit_usd: null },
      { monthly_limit_usd: '5', lifetime_limit_usd: '10' },
    ])
    await db.exec("insert into public.profiles(id) values ('33333333-3333-4333-8333-333333333333')")
    expect(
      (
        await db.query(
          "select monthly_limit_usd::text as monthly,lifetime_limit_usd::text as lifetime from public.profiles where id='33333333-3333-4333-8333-333333333333'",
        )
      ).rows,
    ).toEqual([{ monthly: '0.20', lifetime: '0.20' }])
  } finally {
    await db.close()
  }
})
