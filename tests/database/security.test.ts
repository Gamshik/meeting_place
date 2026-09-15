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
    await rows('select public.start_word_game_recording($1)', [roundId])
    await rows('select public.finish_word_game_recording($1)', [roundId])
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

  it('enforces preparation, guessing, and timeout windows in live-call games', async () => {
    await asUser(alice)
    const invitation = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [invitation.partnershipId])
    await asUser(alice)
    const game = await db.query<{ result: { id: string; mode: string } }>(
      "select public.start_word_game($1,'live_call') result",
      [invitation.partnershipId],
    )
    const gameId = game.rows[0]!.result.id
    expect(game.rows[0]!.result.mode).toBe('live_call')
    await asUser(bob)
    await rows('select public.respond_to_word_game($1,true)', [gameId])

    await asUser(alice)
    const created = await db.query<{
      result: { round: { id: string; explanationMethod: string; status: string } }
    }>('select public.create_word_game_round($1,$2,$3,$4,$5) result', [
      gameId,
      'Food',
      'sandwich',
      ['sandwich'],
      ['sandwich'],
    ])
    const firstRoundId = created.rows[0]!.result.round.id
    expect(created.rows[0]!.result.round).toMatchObject({
      explanationMethod: 'live',
      status: 'awaiting_guess',
    })
    const recordingAccess = await db.query<{ allowed: boolean }>(
      'select public.can_access_word_game_recording($1,true) allowed',
      [`${gameId}/${firstRoundId}.wav`],
    )
    expect(recordingAccess.rows[0]!.allowed).toBe(false)

    await asUser(bob)
    await db.exec('savepoint preparation_window')
    await expect(
      rows('select public.guess_word_game_round($1,$2)', [firstRoundId, 'sandwich']),
    ).rejects.toThrow('word_game_guess_not_available')
    await db.exec('rollback to savepoint preparation_window; reset role')
    await db.query(
      "update public.word_game_rounds set created_at = now() - interval '6 seconds' where id=$1",
      [firstRoundId],
    )
    await asUser(alice)
    await db.exec('savepoint live_recording_disabled')
    await expect(
      rows('select public.submit_word_game_transcript($1,$2,$3,$4,$5)', [
        firstRoundId,
        'This sandwich is served between two pieces of bread.',
        [],
        90,
        'A useful clue.',
      ]),
    ).rejects.toThrow('word_game_round_not_available')
    await db.exec('rollback to savepoint live_recording_disabled')
    await asUser(bob)
    const scored = await db.query<{
      result: { round: { isCorrect: boolean; score: number; usedForbiddenWord: boolean } }
    }>('select public.guess_word_game_round($1,$2) result', [firstRoundId, 'sandwich'])
    expect(scored.rows[0]!.result.round).toMatchObject({
      isCorrect: true,
      score: 1,
    })

    const expiring = await db.query<{ result: { round: { id: string } } }>(
      'select public.create_word_game_round($1,$2,$3,$4,$5) result',
      [gameId, 'Travel', 'passport', ['passport'], ['passport']],
    )
    const expiringRoundId = expiring.rows[0]!.result.round.id
    await asUser(alice)
    await db.exec('savepoint timeout_too_early')
    await expect(
      rows('select public.expire_word_game_round($1)', [expiringRoundId]),
    ).rejects.toThrow('word_game_round_not_expired')
    await db.exec('rollback to savepoint timeout_too_early; reset role')
    await db.query(
      "update public.word_game_rounds set created_at = now() - interval '96 seconds' where id=$1",
      [expiringRoundId],
    )
    await asUser(alice)
    const expired = await db.query<{
      result: {
        currentPlayerId: string
        round: { isCorrect: boolean; score: number; status: string }
      }
    }>('select public.expire_word_game_round($1) result', [expiringRoundId])
    expect(expired.rows[0]!.result).toMatchObject({
      currentPlayerId: alice,
      round: { isCorrect: false, score: 0, status: 'completed' },
    })
  })

  it('lets only the creator change the duration and snapshots it per round', async () => {
    await asUser(alice)
    const invitation = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [invitation.partnershipId])
    await asUser(alice)
    const started = await db.query<{
      result: { id: string; explanationDurationSeconds: number }
    }>("select public.start_word_game($1,'live_call',$2) result", [invitation.partnershipId, 120])
    const gameId = started.rows[0]!.result.id
    expect(started.rows[0]!.result.explanationDurationSeconds).toBe(120)
    await asUser(bob)
    await rows('select public.respond_to_word_game($1,true)', [gameId])

    await asUser(alice)
    const created = await db.query<{
      result: { round: { id: string; explanationDurationSeconds: number } }
    }>('select public.create_word_game_round($1,$2,$3,$4,$5) result', [
      gameId,
      'Food',
      'sandwich',
      ['sandwich'],
      ['sandwich'],
    ])
    expect(created.rows[0]!.result.round.explanationDurationSeconds).toBe(120)

    const updated = await db.query<{
      result: {
        explanationDurationSeconds: number
        round: { explanationDurationSeconds: number }
      }
    }>('select public.update_word_game_settings($1,$2) result', [invitation.partnershipId, 180])
    expect(updated.rows[0]!.result).toMatchObject({
      explanationDurationSeconds: 180,
      round: { explanationDurationSeconds: 120 },
    })

    await asUser(bob)
    await expect(
      rows('select public.update_word_game_settings($1,$2)', [invitation.partnershipId, 240]),
    ).rejects.toThrow('word_game_settings_not_available')
  })

  it('synchronizes recording and enforces the recorded listening deadline', async () => {
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
    const created = await db.query<{ result: { round: { id: string } } }>(
      'select public.create_word_game_round($1,$2,$3,$4,$5) result',
      [gameId, 'Travel', 'passport', ['passport'], ['passport']],
    )
    const roundId = created.rows[0]!.result.round.id
    const started = await db.query<{
      result: { round: { recordingStartedAt: string } }
    }>('select public.start_word_game_recording($1) result', [roundId])
    expect(started.rows[0]!.result.round.recordingStartedAt).toBeTruthy()

    await asUser(bob)
    const partnerView = await db.query<{
      result: { round: { recordingStartedAt: string; secretWord: string | null } }
    }>('select public.get_word_game($1) result', [invitation.partnershipId])
    expect(partnerView.rows[0]!.result.round.recordingStartedAt).toBeTruthy()
    expect(partnerView.rows[0]!.result.round.secretWord).toBeNull()

    await asUser(alice)
    await rows('select public.finish_word_game_recording($1)', [roundId])
    const submitted = await db.query<{
      result: { round: { explainedAt: string; status: string } }
    }>('select public.submit_word_game_transcript($1,$2,$3,$4,$5) result', [
      roundId,
      'A document used at a border.',
      [],
      null,
      null,
    ])
    expect(submitted.rows[0]!.result.round).toMatchObject({ status: 'awaiting_guess' })
    expect(submitted.rows[0]!.result.round.explainedAt).toBeTruthy()

    await asUser(bob)
    await db.exec('savepoint recorded_timeout_too_early')
    await expect(rows('select public.expire_word_game_round($1)', [roundId])).rejects.toThrow(
      'word_game_round_not_expired',
    )
    await db.exec('rollback to savepoint recorded_timeout_too_early; reset role')
    await db.query(
      "update public.word_game_rounds set explained_at = now() - interval '91 seconds' where id=$1",
      [roundId],
    )
    await asUser(bob)
    await db.exec('savepoint recorded_guess_too_late')
    await expect(
      rows('select public.guess_word_game_round($1,$2)', [roundId, 'passport']),
    ).rejects.toThrow('word_game_guess_not_available')
    await db.exec('rollback to savepoint recorded_guess_too_late')

    const expired = await db.query<{
      result: { currentPlayerId: string; round: { score: number; status: string } }
    }>('select public.expire_word_game_round($1) result', [roundId])
    expect(expired.rows[0]!.result).toMatchObject({
      currentPlayerId: bob,
      round: { score: 0, status: 'completed' },
    })
  })

  it('uses every unseen pooled word before the least-recently-seen fallback', async () => {
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

    const seenWords = new Set<string>()
    let currentPlayer = alice
    for (let turn = 0; turn < 10; turn += 1) {
      await asUser(currentPlayer)
      const created = await db.query<{
        result: { round: { id: string; secretWord: string } }
      }>('select public.create_word_game_round_from_pool($1,$2,false) result', [gameId, 'Travel'])
      const createdRound = created.rows[0]!.result.round
      expect(seenWords.has(createdRound.secretWord)).toBe(false)
      seenWords.add(createdRound.secretWord)
      await rows('select public.skip_word_game_round($1)', [createdRound.id])
      currentPlayer = currentPlayer === alice ? bob : alice
    }

    await asUser(currentPlayer)
    const exhausted = await db.query<{ result: null }>(
      'select public.create_word_game_round_from_pool($1,$2,false) result',
      [gameId, 'Travel'],
    )
    expect(exhausted.rows[0]!.result).toBeNull()

    const fallback = await db.query<{
      result: { round: { secretWord: string } }
    }>('select public.create_word_game_round_from_pool($1,$2,true) result', [gameId, 'Travel'])
    expect(seenWords.has(fallback.rows[0]!.result.round.secretWord)).toBe(true)
    expect(seenWords.size).toBe(10)
    await db.exec('savepoint private_word_cards')
    await expect(rows('select * from public.word_game_cards')).rejects.toThrow(/permission denied/)
    await db.exec('rollback to savepoint private_word_cards')
    await expect(rows('select * from public.word_game_card_exposures')).rejects.toThrow(
      /permission denied/,
    )
  })

  it('keeps only genuinely new cards from a generated batch', async () => {
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

    const batch = [
      {
        word: 'passport',
        acceptedAnswers: ['passport', 'passports'],
        forbiddenWords: ['passport', 'passports'],
      },
      {
        word: 'travel adapter',
        acceptedAnswers: ['travel adapter', 'travel adapters'],
        forbiddenWords: ['travel adapter', 'travel adapters'],
      },
    ]
    const first = await db.query<{ result: number }>(
      'select public.cache_word_game_cards($1,$2,$3,$4) result',
      [gameId, 'Travel', 'test-model', JSON.stringify(batch)],
    )
    const second = await db.query<{ result: number }>(
      'select public.cache_word_game_cards($1,$2,$3,$4) result',
      [gameId, 'Travel', 'test-model', JSON.stringify(batch)],
    )

    expect(first.rows[0]!.result).toBe(1)
    expect(second.rows[0]!.result).toBe(0)
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
    await rows('select public.start_word_game_recording($1)', [roundId])
    await rows('select public.finish_word_game_recording($1)', [roundId])
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

  it('does not let a player accept another game while one is active', async () => {
    await asUser(alice)
    const firstPartnership = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [firstPartnership.partnershipId])
    await asUser(eve)
    const secondPartnership = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [secondPartnership.partnershipId])
    await asUser(eve)
    const secondGame = await db.query<{ result: { id: string } }>(
      'select public.start_word_game($1) result',
      [secondPartnership.partnershipId],
    )

    await asUser(alice)
    const firstGame = await db.query<{ result: { id: string } }>(
      'select public.start_word_game($1) result',
      [firstPartnership.partnershipId],
    )
    await asUser(bob)
    await rows('select public.respond_to_word_game($1,true)', [firstGame.rows[0]!.result.id])

    await db.exec('savepoint cannot_accept_while_playing')
    await expect(
      rows('select public.respond_to_word_game($1,true)', [secondGame.rows[0]!.result.id]),
    ).rejects.toThrow('word_game_player_busy')
    await db.exec('rollback to savepoint cannot_accept_while_playing')

    await rows('select public.respond_to_word_game($1,false)', [secondGame.rows[0]!.result.id])
    await expect(
      rows('select public.get_word_game($1)', [secondPartnership.partnershipId]),
    ).rejects.toThrow('word_game_not_found')
  })

  it('does not create an invitation when the selected player is already playing', async () => {
    await asUser(alice)
    const firstPartnership = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [firstPartnership.partnershipId])
    await asUser(alice)
    const firstGame = await db.query<{ result: { id: string } }>(
      'select public.start_word_game($1) result',
      [firstPartnership.partnershipId],
    )
    await asUser(bob)
    await rows('select public.respond_to_word_game($1,true)', [firstGame.rows[0]!.result.id])

    await asUser(eve)
    const secondPartnership = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [secondPartnership.partnershipId])
    await asUser(eve)
    await db.exec('savepoint cannot_invite_busy_player')
    await expect(
      rows('select public.start_word_game($1)', [secondPartnership.partnershipId]),
    ).rejects.toThrow('word_game_partner_busy')
    await db.exec('rollback to savepoint cannot_invite_busy_player')

    await expect(
      rows('select public.get_word_game($1)', [secondPartnership.partnershipId]),
    ).rejects.toThrow('word_game_not_found')
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
      result: {
        id: string
        status: string
        requestedById: string
        scores: { you: number }
        round: unknown
      }
    }>('select public.start_word_game($1) result', [invitation.partnershipId])
    expect(restarted.rows[0]!.result.id).not.toBe(requested.rows[0]!.result.id)
    expect(restarted.rows[0]!.result).toMatchObject({
      status: 'pending',
      requestedById: alice,
      scores: { you: 0 },
      round: null,
    })
  })

  it('preserves completed games and their rounds after starting a new game', async () => {
    await asUser(alice)
    const invitation = await invite('bob')
    await asUser(bob)
    await rows('select public.respond_to_partnership($1,true)', [invitation.partnershipId])
    await asUser(alice)
    const first = await db.query<{ result: { id: string } }>(
      'select public.start_word_game($1) result',
      [invitation.partnershipId],
    )
    const firstGameId = first.rows[0]!.result.id
    await asUser(bob)
    await rows('select public.respond_to_word_game($1,true)', [firstGameId])
    await asUser(alice)
    const created = await db.query<{ result: { round: { id: string } } }>(
      'select public.create_word_game_round($1,$2,$3,$4,$5) result',
      [firstGameId, 'Travel', 'passport', ['passport'], ['passport']],
    )
    await rows('select public.skip_word_game_round($1)', [created.rows[0]!.result.round.id])
    await rows('select public.end_word_game($1)', [invitation.partnershipId])

    const beforeRestart = await db.query<{
      history_id: string
      round_count: number
      rounds: { word: string; status: string }[]
    }>('select history_id, round_count, rounds from public.list_my_word_game_history()')
    expect(beforeRestart.rows).toHaveLength(1)
    expect(beforeRestart.rows[0]).toMatchObject({
      history_id: firstGameId,
      round_count: 1,
      rounds: [{ word: 'passport', status: 'skipped' }],
    })

    const restarted = await db.query<{ result: { id: string; rounds: unknown[] } }>(
      'select public.start_word_game($1) result',
      [invitation.partnershipId],
    )
    expect(restarted.rows[0]!.result.id).not.toBe(firstGameId)
    expect(restarted.rows[0]!.result.rounds).toEqual([])

    const afterRestart = await rows('select history_id from public.list_my_word_game_history()')
    expect(afterRestart).toEqual([{ history_id: firstGameId }])
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
    await rows('select public.start_word_game_recording($1)', [created.rows[0]!.result.round.id])
    await rows('select public.finish_word_game_recording($1)', [created.rows[0]!.result.round.id])
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

  it('builds balanced activity and shares it only with active partners', async () => {
    await asUser(alice)
    await rows("update public.profiles set time_zone='Europe/Minsk' where id=$1", [alice])
    await db.exec('savepoint invalid_profile_time_zone')
    await expect(
      rows("update public.profiles set time_zone='VPN/Nowhere' where id=$1", [alice]),
    ).rejects.toThrow('invalid_time_zone')
    await db.exec('rollback to savepoint invalid_profile_time_zone')
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
    const first = await db.query<{ result: { round: { id: string } } }>(
      'select public.create_word_game_round($1,$2,$3,$4,$5) result',
      [gameId, 'Travel', 'passport', ['passport'], ['passport']],
    )
    await rows('select public.start_word_game_recording($1)', [first.rows[0]!.result.round.id])
    await rows('select public.finish_word_game_recording($1)', [first.rows[0]!.result.round.id])
    await rows('select public.submit_word_game_transcript($1,$2,$3,$4,$5)', [
      first.rows[0]!.result.round.id,
      'A document used at a border.',
      [{ word: 'border', start: 11.7, end: 12.2 }],
      null,
      null,
    ])
    await asUser(bob)
    await rows('select public.guess_word_game_round($1,$2)', [
      first.rows[0]!.result.round.id,
      'passport',
    ])

    const second = await db.query<{ result: { round: { id: string } } }>(
      'select public.create_word_game_round($1,$2,$3,$4,$5) result',
      [gameId, 'Food', 'sandwich', ['sandwich'], ['sandwich']],
    )
    await rows('select public.start_word_game_recording($1)', [second.rows[0]!.result.round.id])
    await rows('select public.finish_word_game_recording($1)', [second.rows[0]!.result.round.id])
    await rows('select public.submit_word_game_transcript($1,$2,$3,$4,$5)', [
      second.rows[0]!.result.round.id,
      'A quick meal between bread.',
      [{ word: 'bread', start: 8.5, end: 9.1 }],
      null,
      null,
    ])
    await asUser(alice)
    await rows('select public.guess_word_game_round($1,$2)', [
      second.rows[0]!.result.round.id,
      'sandwich',
    ])
    await rows('select public.end_word_game($1)', [invitation.partnershipId])

    await db.exec('reset role')
    const nearMidnightUtc = '2025-10-01T22:30:00Z'
    await db.query(
      'update public.word_games set created_at=$2, accepted_at=$2, finished_at=$2 where id=$1',
      [gameId, nearMidnightUtc],
    )
    await db.query(
      'update public.word_game_rounds set created_at=$2, explained_at=$2, completed_at=$2 where game_id=$1',
      [gameId, nearMidnightUtc],
    )
    await asUser(alice)

    const year = 2026
    const aliceActivity = await db.query<{
      result: {
        isOwner: boolean
        timeZone: string
        startDate: string
        endDate: string
        totals: { interactionCount: number; speakingDurationSeconds: number }
        days: { interactionCount: number; intensity: number }[]
      }
    }>('select public.get_profile_activity($1,$2) result', [alice, year])
    const activityWindow = await db.query<{ start_date: string; end_date: string }>(`
      select ((now() at time zone 'Europe/Minsk')::date - 364)::text start_date,
        (now() at time zone 'Europe/Minsk')::date::text end_date
    `)
    expect(aliceActivity.rows[0]!.result).toMatchObject({
      isOwner: true,
      timeZone: 'Europe/Minsk',
      startDate: activityWindow.rows[0]!.start_date,
      endDate: activityWindow.rows[0]!.end_date,
      totals: { interactionCount: 5, speakingDurationSeconds: 13 },
    })
    expect(aliceActivity.rows[0]!.result.days).toEqual([
      expect.objectContaining({ date: '2025-10-02', interactionCount: 5, intensity: 2 }),
    ])

    await asUser(bob)
    const sharedActivity = await db.query<{
      result: { isOwner: boolean; totals: { interactionCount: number } }
    }>('select public.get_profile_activity($1,$2) result', [alice, year])
    expect(sharedActivity.rows[0]!.result).toMatchObject({
      isOwner: false,
      totals: { interactionCount: 5 },
    })

    await asUser(eve)
    await db.exec('savepoint unrelated_profile_is_private')
    await expect(rows('select public.get_profile_activity($1,$2)', [alice, year])).rejects.toThrow(
      'profile_not_available',
    )
    await db.exec('rollback to savepoint unrelated_profile_is_private')

    await asUser(bob)
    await rows('select public.end_partnership($1)', [invitation.partnershipId])
    await expect(rows('select public.get_profile_activity($1,$2)', [alice, year])).rejects.toThrow(
      'profile_not_available',
    )
  })
})
