import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const eve = '33333333-3333-4333-8333-333333333333'
const db = new PGlite()

async function asUser(id: string) {
  await db.exec('reset role; set local role authenticated;')
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id])
}
async function invite(username: string) {
  const { rows } = await db.query<{
    result: { ok: boolean; code?: string; partnershipId: string }
  }>('select public.invite_partner($1) result', [username])
  return rows[0]!.result
}
async function rows(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows
}

beforeAll(async () => {
  // PGlite runs PostgreSQL itself. Only Supabase identity/roles and pgcrypto's
  // UUID alias are bootstrapped; both application migrations execute below.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create function extensions.gen_random_uuid() returns uuid language sql as $$select gen_random_uuid()$$;
  `)
  for (const name of (await readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const migration = await readFile(`supabase/migrations/${name}`, 'utf8')
    await db.exec(
      migration.replace('create extension if not exists pgcrypto with schema extensions;', ''),
    )
  }
  for (const [id, name] of [
    [alice, 'alice'],
    [bob, 'bob'],
    [eve, 'eve'],
  ]) {
    await db.query('insert into auth.users values ($1, $2, $3)', [id, `${name}@example.test`, {}])
    await db.query('update public.profiles set username=$1 where id=$2', [name, id])
  }
})
beforeEach(async () => {
  await db.exec('begin')
})
afterEach(async () => {
  await db.exec('rollback; reset role')
})
afterAll(async () => {
  await db.close()
})

describe('database authorization and lifecycle', () => {
  it('creates matching profiles and survives an occupied generated username', async () => {
    await db.query("update public.profiles set username='newuser_aaaaaaaa' where id=$1", [eve])
    await db.exec(
      "insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'newuser@example.test', '{}')",
    )
    const profile = await rows(
      "select username from public.profiles where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'",
    )
    expect(profile).toHaveLength(1)
    expect(profile[0]).not.toEqual({ username: 'newuser_aaaaaaaa' })
  })
  it('restricts profile reads and updates to the current account', async () => {
    await asUser(alice)
    expect(await rows('select id from public.profiles')).toEqual([{ id: alice }])
    expect(
      await rows("update public.profiles set display_name='Changed' where id=$1 returning id", [
        bob,
      ]),
    ).toEqual([])
    expect(
      await rows("update public.profiles set display_name='Alice' where id=$1 returning id", [
        alice,
      ]),
    ).toEqual([{ id: alice }])
  })
  it('forbids direct partnership inserts', async () => {
    await asUser(alice)
    await expect(
      rows('insert into public.partnerships(inviter_id, invitee_id) values ($1,$2)', [alice, bob]),
    ).rejects.toThrow(/permission denied/)
  })
  it('forbids direct partnership updates', async () => {
    await asUser(alice)
    await expect(rows("update public.partnerships set status='active'")).rejects.toThrow(
      /permission denied/,
    )
  })
  it('forbids privileged profile-column updates', async () => {
    await asUser(alice)
    await expect(
      rows("update public.profiles set avatar_url='https://tracker.example' where id=$1", [alice]),
    ).rejects.toThrow(/permission denied/)
  })
  it('rejects anonymous RPC calls', async () => {
    await db.exec('set local role anon')
    await expect(invite('alice')).rejects.toThrow(/permission denied/)
  })
  it('keeps the attempt ledger inaccessible', async () => {
    await asUser(alice)
    await expect(rows('select * from private.invitation_limits')).rejects.toThrow(
      /permission denied/,
    )
  })
  it('allows only the invitee to accept', async () => {
    await asUser(alice)
    const result = await invite('bob')
    await expect(
      rows('select public.respond_to_partnership($1,true)', [result.partnershipId]),
    ).rejects.toThrow('pending_invitation_not_found')
  })
  it('hides partnerships and rejects changes by a third user', async () => {
    await asUser(alice)
    const result = await invite('bob')
    await asUser(eve)
    expect(await rows('select * from public.partnerships')).toEqual([])
    expect(await rows('select * from public.list_my_partnerships()')).toEqual([])
    await expect(rows('select public.end_partnership($1)', [result.partnershipId])).rejects.toThrow(
      'partnership_not_found',
    )
  })
  it('accepts then ends a partnership and enforces cooldown', async () => {
    await asUser(alice)
    const result = await invite('bob')
    expect(result.ok).toBe(true)
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [result.partnershipId])
    expect(
      await rows('select status, accepted_at is not null as accepted from public.partnerships'),
    ).toEqual([{ status: 'active', accepted: true }])
    await rows('select public.end_partnership($1)', [result.partnershipId])
    expect((await invite('alice')).code).toBe('invitation_cooldown')
  })
  it('allows cancellation only by the inviter', async () => {
    await asUser(alice)
    const result = await invite('bob')
    await asUser(bob)
    await expect(rows('select public.end_partnership($1)', [result.partnershipId])).rejects.toThrow(
      'partnership_not_found',
    )
  })
  it('counts invalid and missing-username attempts and expires the rolling quota', async () => {
    await asUser(alice)
    for (let i = 0; i < 10; i++) expect((await invite(i % 2 ? 'missing' : '!')).ok).toBe(false)
    expect((await invite('bob')).code).toBe('invitation_rate_limited')
    await db.exec(
      "reset role; update private.invitation_limits set attempted_at=array[clock_timestamp()-interval '2 hours']",
    )
    await asUser(alice)
    expect((await invite('bob')).ok).toBe(true)
  })
  it('blocks repeat invitations after decline until the cooldown expires', async () => {
    await asUser(alice)
    const result = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,false)', [result.partnershipId])
    await asUser(alice)
    expect((await invite('bob')).code).toBe('invitation_cooldown')
    await db.exec("reset role; update public.partnerships set ended_at=now()-interval '8 days'")
    await asUser(alice)
    expect((await invite('bob')).ok).toBe(true)
  })
  it('prevents duplicate unordered pairs and self invitations', async () => {
    await asUser(alice)
    expect((await invite('alice')).code).toBe('cannot_invite_yourself')
    expect((await invite('bob')).ok).toBe(true)
    await asUser(bob)
    expect((await invite('alice')).code).toBe('partnership_already_exists')
  })
  it('enforces distinct people even for a privileged insert', async () => {
    await expect(
      rows('insert into public.partnerships(inviter_id,invitee_id) values ($1,$1)', [alice]),
    ).rejects.toThrow(/partnerships_two_different_people/)
  })
  it('paginates deterministically when creation times are equal', async () => {
    await db.query(
      "insert into public.partnerships(inviter_id,invitee_id,created_at) values ($1,$2,'2026-01-01'),($1,$3,'2026-01-01')",
      [alice, bob, eve],
    )
    await asUser(alice)
    const first = await db.query<{ partnership_id: string; created_at: Date }>(
      'select * from public.list_my_partnerships(null,null,1)',
    )
    const item = first.rows[0]!
    const second = await rows('select * from public.list_my_partnerships($1,$2,1)', [
      item.created_at,
      item.partnership_id,
    ])
    expect(second).toHaveLength(1)
    expect(second[0]).not.toEqual(item)
  })
})
