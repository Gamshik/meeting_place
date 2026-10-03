import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}))
import { app } from './app'
import { signUsage, type UsageReceipt } from './lib/ai-usage'
const owner = '11111111-1111-4111-8111-111111111111'
const user = '22222222-2222-4222-8222-222222222222'
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'key',
  OPENROUTER_API_KEY: 'secret',
}
const receipt: UsageReceipt = {
  id: '33333333-3333-4333-8333-333333333333',
  userId: user,
  gameId: '44444444-4444-4444-8444-444444444444',
  operation: 'cards',
  model: 'test',
  outcome: 'succeeded',
  providerRequestId: 'test',
  costUsd: '0.001000000000',
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: null,
  audioSeconds: null,
}
async function row(changes: Partial<UsageReceipt> = {}) {
  const value = { ...receipt, ...changes }
  return {
    id: value.id,
    requester_id: user,
    game_id: value.gameId,
    operation: value.operation,
    created_at: '2026-10-02T00:00:00Z',
    receipt: await signUsage('secret', value),
  }
}
const request = (query = '') =>
  app.request('/api/admin/users' + query, { headers: { Authorization: 'Bearer token' } }, env)
beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: owner } }, error: null })
  mocks.rpc.mockReset().mockImplementation(async (name: string) => ({
    data:
      name === 'is_current_user_admin'
        ? true
        : name === 'admin_list_users'
          ? [
              { id: user, username: 'learner', display_name: 'Learner' },
              { id: owner, username: 'owner', display_name: 'Owner' },
            ]
          : [],
    error: null,
  }))
})
it('blocks unauthenticated and non-admin callers before reading users', async () => {
  expect((await app.request('/api/admin/users', {}, env)).status).toBe(401)
  mocks.rpc.mockResolvedValue({ data: false, error: null })
  expect((await request()).status).toBe(403)
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).toHaveBeenCalledWith('is_current_user_admin')
})
it('validates period and cursor', async () => {
  expect((await request('?period=week')).status).toBe(400)
  expect((await request('?afterId=bad')).status).toBe(400)
})
it('verifies other users receipts, excludes forgery and binding mismatches, and includes zero-usage users', async () => {
  const valid = await row()
  const unknown = await row({ id: crypto.randomUUID(), costUsd: null, inputTokens: null })
  const wrongUser = await row({ userId: owner })
  const forged = { ...valid, receipt: { payload: '{}', signature: 'a'.repeat(64) } }
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({
      data: [
        { id: user, username: 'learner', display_name: 'Learner' },
        { id: owner, username: 'owner', display_name: 'Owner' },
      ],
    })
    .mockResolvedValueOnce({ data: [valid, unknown, wrongUser, forged] })
  const response = await request()
  expect(response.status).toBe(200)
  expect((await response.json()).data.users).toMatchObject([
    {
      id: user,
      knownCostUsd: '0.001000000000',
      knownTokens: '15',
      unknownCostCount: 1,
      unknownTokenCount: 1,
      unverifiedCount: 2,
    },
    { id: owner, knownCostUsd: '0.000000000000', knownTokens: '0', unverifiedCount: 0 },
  ])
})
it('separates transcription seconds from word tokens while summing both costs', async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: [{ id: user, username: 'learner', display_name: 'Learner' }] })
    .mockResolvedValueOnce({
      data: [
        await row(),
        await row({
          id: crypto.randomUUID(),
          operation: 'transcription',
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          audioSeconds: 12.5,
        }),
        await row({
          id: crypto.randomUUID(),
          operation: 'transcription',
          totalTokens: 999,
          audioSeconds: 3.25,
        }),
      ],
    })
  const result = await (await request()).json()
  expect(result.data.users[0]).toMatchObject({
    knownCostUsd: '0.003000000000',
    knownTokens: '15',
    knownAudioSeconds: 15.75,
    unknownTokenCount: 0,
    unknownAudioDurationCount: 0,
    unknownCostCount: 0,
  })
})
it('counts missing metadata only for the applicable operation, preserving known zero duration', async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: [{ id: user, username: 'learner', display_name: 'Learner' }] })
    .mockResolvedValueOnce({
      data: [
        await row({ inputTokens: null, outputTokens: null }),
        await row({
          id: crypto.randomUUID(),
          operation: 'transcription',
          inputTokens: null,
          outputTokens: null,
          audioSeconds: null,
        }),
        await row({
          id: crypto.randomUUID(),
          operation: 'transcription',
          inputTokens: null,
          outputTokens: null,
          audioSeconds: 0,
        }),
      ],
    })
  const result = await (await request()).json()
  expect(result.data.users[0]).toMatchObject({
    knownTokens: '0',
    knownAudioSeconds: 0,
    unknownTokenCount: 1,
    unknownAudioDurationCount: 1,
    unknownCostCount: 0,
  })
})
it('sums every usage batch without counting the lookahead twice', async () => {
  const rows = await Promise.all(
    Array.from({ length: 501 }, () => row({ id: crypto.randomUUID() })),
  )
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: [{ id: user, username: 'learner', display_name: 'Learner' }] })
    .mockResolvedValueOnce({ data: rows })
    .mockResolvedValueOnce({ data: [rows[500]] })
  const result = await (await request()).json()
  expect(result.data.users[0]).toMatchObject({
    knownCostUsd: '0.501000000000',
    knownTokens: '7515',
  })
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    'admin_list_usage',
    expect.objectContaining({ p_after_id: rows[499]!.id }),
  )
})
it('paginates users independently of their usage and applies the UTC month', async () => {
  const profiles = Array.from({ length: 21 }, () => ({
    id: crypto.randomUUID(),
    username: 'learner',
    display_name: 'Learner',
  }))
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: profiles })
    .mockResolvedValueOnce({ data: [] })
  const result = await (await request(`?period=month&afterId=${owner}`)).json()
  expect(result.data.users).toHaveLength(20)
  expect(result.data.nextCursor).toBe(profiles[19]!.id)
  const now = new Date()
  expect(result.data.from).toBe(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
  )
  expect(mocks.rpc).toHaveBeenCalledWith('admin_list_users', { p_after_id: owner })
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    'admin_list_usage',
    expect.objectContaining({ p_user_ids: profiles.slice(0, 20).map((p) => p.id) }),
  )
})
it('returns an error instead of partial totals when a later batch fails or access is revoked', async () => {
  const valid = await row()
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: [{ id: user, username: 'learner', display_name: 'Learner' }] })
    .mockResolvedValueOnce({ data: Array(501).fill(valid) })
    .mockResolvedValueOnce({ error: { code: '42501' } })
  const response = await request()
  expect(response.status).toBe(403)
  expect(await response.json()).not.toHaveProperty('data')
})
