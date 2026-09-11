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
    create schema auth; create schema extensions; create schema storage;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create function extensions.gen_random_uuid() returns uuid language sql as $$select gen_random_uuid()$$;
    create table storage.buckets(
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects(bucket_id text not null, name text not null);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, update on storage.objects to authenticated;
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

  it('keeps game secrets private and alternates turns after a guess', async () => {
    await asUser(alice)
    const invitation = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [invitation.partnershipId])
    await asUser(alice)
    const game = await db.query<{ result: { id: string } }>(
      'select public.start_word_game($1) result',
      [invitation.partnershipId],
    )
    const gameId = game.rows[0]!.result.id
    await asUser(bob)
    await rows('select public.respond_to_word_game($1,true)', [gameId])
    await asUser(alice)
    const created = await db.query<{ result: { round: { id: string; secretWord: string } } }>(
      'select public.create_word_game_round($1,$2,$3,$4,$5) result',
      [gameId, 'Travel', 'passport', ['passport', 'passports'], ['passport', 'passports']],
    )
    const roundId = created.rows[0]!.result.round.id
    expect(created.rows[0]!.result.round.secretWord).toBe('passport')

    await asUser(bob)
    const hidden = await db.query<{
      result: { round: { secretWord: string | null; forbiddenWords: string[] | null } }
    }>('select public.get_word_game($1) result', [invitation.partnershipId])
    expect(hidden.rows[0]!.result.round.secretWord).toBeNull()
    expect(hidden.rows[0]!.result.round.forbiddenWords).toBeNull()

    await asUser(alice)
    await rows('select public.submit_word_game_transcript($1,$2,$3,$4,$5)', [
      roundId,
      'You need this document to cross a border.',
      [],
      88,
      'Clear and concise.',
    ])
    await asUser(bob)
    const guessed = await db.query<{
      result: { currentPlayerId: string; round: { isCorrect: boolean; score: number } }
    }>('select public.guess_word_game_round($1,$2) result', [roundId, 'Passports!'])
    expect(guessed.rows[0]!.result.round).toMatchObject({ isCorrect: true, score: 1 })
    expect(guessed.rows[0]!.result.currentPlayerId).toBe(bob)
    await expect(rows('select * from public.word_game_rounds')).rejects.toThrow(/permission denied/)
  })

  it('requires the invited partner to approve a game and protects its recording', async () => {
    await asUser(alice)
    const invitation = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [invitation.partnershipId])
    await asUser(alice)
    const requested = await db.query<{
      result: { id: string; status: string; requestedById: string }
    }>('select public.start_word_game($1) result', [invitation.partnershipId])
    const requestedGame = requested.rows[0]!.result
    expect(requestedGame).toMatchObject({ status: 'pending', requestedById: alice })
    await db.exec('savepoint requester_cannot_accept')
    await expect(
      rows('select public.respond_to_word_game($1,true)', [requestedGame.id]),
    ).rejects.toThrow('word_game_invitation_not_available')
    await db.exec('rollback to savepoint requester_cannot_accept')
    await db.exec('savepoint round_requires_acceptance')
    await expect(
      rows('select public.create_word_game_round($1,$2,$3,$4,$5)', [
        requestedGame.id,
        'Travel',
        'passport',
        ['passport'],
        ['passport'],
      ]),
    ).rejects.toThrow('word_game_turn_not_available')
    await db.exec('rollback to savepoint round_requires_acceptance')

    await asUser(bob)
    const accepted = await db.query<{ result: { status: string; acceptedAt: string } }>(
      'select public.respond_to_word_game($1,true) result',
      [requestedGame.id],
    )
    expect(accepted.rows[0]!.result.status).toBe('active')
    expect(accepted.rows[0]!.result.acceptedAt).toBeTruthy()

    await asUser(alice)
    const created = await db.query<{ result: { round: { id: string } } }>(
      'select public.create_word_game_round($1,$2,$3,$4,$5) result',
      [requestedGame.id, 'Travel', 'passport', ['passport'], ['passport']],
    )
    const roundId = created.rows[0]!.result.round.id
    const audioPath = `${requestedGame.id}/${roundId}.wav`
    await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', [
      'word-game-recordings',
      audioPath,
    ])
    await asUser(bob)
    expect(await rows('select name from storage.objects')).toEqual([])
    await asUser(alice)
    await rows('select public.submit_word_game_transcript($1,$2,$3,$4,$5)', [
      roundId,
      'A document used at a border.',
      [],
      null,
      null,
    ])
    await asUser(bob)
    expect(await rows('select name from storage.objects')).toEqual([{ name: audioPath }])
  })

  it('pauses, resumes, and finishes a game from participant presence', async () => {
    await asUser(alice)
    const invitation = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [invitation.partnershipId])
    await asUser(alice)
    const requested = await db.query<{ result: { id: string } }>(
      'select public.start_word_game($1) result',
      [invitation.partnershipId],
    )
    const gameId = requested.rows[0]!.result.id
    await asUser(bob)
    await rows('select public.respond_to_word_game($1,true)', [gameId])

    await asUser(alice)
    await rows('select public.heartbeat_word_game($1)', [invitation.partnershipId])
    await asUser(bob)
    await rows('select public.heartbeat_word_game($1)', [invitation.partnershipId])
    await rows('select public.leave_word_game($1)', [invitation.partnershipId])

    await asUser(alice)
    const paused = await db.query<{
      result: { status: string; disconnectedPlayerId: string; reconnectDeadline: string }
    }>('select public.heartbeat_word_game($1) result', [invitation.partnershipId])
    expect(paused.rows[0]!.result).toMatchObject({
      status: 'paused',
      disconnectedPlayerId: bob,
    })
    expect(new Date(paused.rows[0]!.result.reconnectDeadline).getTime()).toBeGreaterThan(Date.now())

    await asUser(bob)
    const resumed = await db.query<{ result: { status: string } }>(
      'select public.heartbeat_word_game($1) result',
      [invitation.partnershipId],
    )
    expect(resumed.rows[0]!.result.status).toBe('active')

    await rows('select public.leave_word_game($1)', [invitation.partnershipId])
    await db.exec('reset role')
    await db.query(
      "update public.word_games set reconnect_deadline = now() - interval '1 second' where id=$1",
      [gameId],
    )
    await asUser(alice)
    const finished = await db.query<{ result: { status: string; finishedAt: string } }>(
      'select public.heartbeat_word_game($1) result',
      [invitation.partnershipId],
    )
    expect(finished.rows[0]!.result.status).toBe('finished')
    expect(finished.rows[0]!.result.finishedAt).toBeTruthy()
  })

  it('allows either participant to finish a game immediately', async () => {
    await asUser(alice)
    const invitation = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [invitation.partnershipId])
    await asUser(alice)
    const requested = await db.query<{ result: { id: string } }>(
      'select public.start_word_game($1) result',
      [invitation.partnershipId],
    )
    await asUser(bob)
    await rows('select public.respond_to_word_game($1,true)', [requested.rows[0]!.result.id])
    await rows('select public.end_word_game($1)', [invitation.partnershipId])

    await asUser(alice)
    const ended = await db.query<{ result: { status: string; finishedAt: string } }>(
      'select public.get_word_game($1) result',
      [invitation.partnershipId],
    )
    expect(ended.rows[0]!.result.status).toBe('finished')
    expect(ended.rows[0]!.result.finishedAt).toBeTruthy()
    await db.exec('savepoint finished_game_is_locked')
    await expect(
      rows('select public.create_word_game_round($1,$2,$3,$4,$5)', [
        requested.rows[0]!.result.id,
        'Travel',
        'passport',
        ['passport'],
        ['passport'],
      ]),
    ).rejects.toThrow('word_game_turn_not_available')
    await db.exec('rollback to savepoint finished_game_is_locked')

    const restarted = await db.query<{
      result: { status: string; requestedById: string; scores: { you: number }; round: unknown }
    }>('select public.start_word_game($1) result', [invitation.partnershipId])
    expect(restarted.rows[0]!.result).toMatchObject({
      status: 'pending',
      requestedById: alice,
      scores: { you: 0 },
      round: null,
    })
  })

  it('denies a point when the transcription contains the secret word', async () => {
    await asUser(alice)
    const invitation = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [invitation.partnershipId])
    await asUser(alice)
    const game = await db.query<{ result: { id: string } }>(
      'select public.start_word_game($1) result',
      [invitation.partnershipId],
    )
    await asUser(bob)
    await rows('select public.respond_to_word_game($1,true)', [game.rows[0]!.result.id])
    await asUser(alice)
    const created = await db.query<{ result: { round: { id: string } } }>(
      'select public.create_word_game_round($1,$2,$3,$4,$5) result',
      [game.rows[0]!.result.id, 'Food', 'sandwich', ['sandwich'], ['sandwich']],
    )
    await rows('select public.submit_word_game_transcript($1,$2,$3,$4,$5)', [
      created.rows[0]!.result.round.id,
      'It is a sandwich with two pieces of bread.',
      [],
      null,
      null,
    ])
    await asUser(bob)
    const guessed = await db.query<{
      result: { round: { isCorrect: boolean; score: number; usedForbiddenWord: boolean } }
    }>('select public.guess_word_game_round($1,$2) result', [
      created.rows[0]!.result.round.id,
      'sandwich',
    ])
    expect(guessed.rows[0]!.result.round).toMatchObject({
      isCorrect: false,
      score: 0,
      usedForbiddenWord: true,
    })
  })
})
