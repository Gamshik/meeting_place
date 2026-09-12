import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'

// This suite writes disposable fixtures only to the local Supabase database.
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  max: 16,
  connectionTimeoutMillis: 5000,
})
async function authenticated(id, sql, values = []) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('set local role authenticated')
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [id])
    const result = await client.query(sql, values)
    await client.query('commit')
    return result.rows[0]?.result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

test('real PostgreSQL concurrency, cooldown, and quota rules', async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  const names = ids.map((id) => `test_${id.replaceAll('-', '').slice(0, 24)}`)
  try {
    for (const [index, id] of ids.entries()) {
      await pool.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,'{}')", [
        id,
        `${names[index]}@example.test`,
      ])
      await pool.query('update public.profiles set username=$1 where id=$2', [names[index], id])
    }
    const pair = await Promise.all([
      authenticated(ids[0], 'select public.invite_partner($1) result', [names[1]]),
      authenticated(ids[1], 'select public.invite_partner($1) result', [names[0]]),
    ])
    assert.equal(pair.filter((result) => result.ok).length, 1)
    assert.equal(pair.filter((result) => result.code === 'partnership_already_exists').length, 1)
    const winner = pair.findIndex((result) => result.ok)
    const partnershipId = pair[winner].partnershipId
    const owner = ids[winner]
    const target = names[1 - winner]
    const [, reinvite] = await Promise.all([
      authenticated(owner, 'select public.end_partnership($1)', [partnershipId]),
      authenticated(owner, 'select public.invite_partner($1) result', [target]),
    ])
    assert.ok(['partnership_already_exists', 'invitation_cooldown'].includes(reinvite.code))
    assert.equal(
      (await authenticated(owner, 'select public.invite_partner($1) result', [target])).code,
      'invitation_cooldown',
    )
    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        authenticated(ids[2], "select public.invite_partner('missing_concurrent_user') result"),
      ),
    )
    assert.equal(attempts.filter((result) => result.code === 'profile_not_found').length, 10)
    assert.equal(attempts.filter((result) => result.code === 'invitation_rate_limited').length, 2)

    const gameInvitation = await authenticated(ids[3], 'select public.invite_partner($1) result', [
      names[4],
    ])
    await authenticated(ids[4], 'select public.respond_to_partnership($1,true) result', [
      gameInvitation.partnershipId,
    ])
    const game = await authenticated(ids[3], 'select public.start_word_game($1) result', [
      gameInvitation.partnershipId,
    ])
    await authenticated(ids[4], 'select public.respond_to_word_game($1,true) result', [game.id])

    const rounds = await Promise.allSettled([
      authenticated(ids[3], 'select public.create_word_game_round_from_pool($1,$2,false) result', [
        game.id,
        'Travel',
      ]),
      authenticated(ids[3], 'select public.create_word_game_round_from_pool($1,$2,false) result', [
        game.id,
        'Travel',
      ]),
    ])
    assert.equal(rounds.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(rounds.filter((result) => result.status === 'rejected').length, 1)
    const rejectedRound = rounds.find((result) => result.status === 'rejected')
    assert.match(String(rejectedRound.reason), /word_game_round_in_progress/)
  } finally {
    await pool
      .query('delete from auth.users where id=any($1::uuid[])', [ids])
      .finally(() => pool.end())
  }
})
