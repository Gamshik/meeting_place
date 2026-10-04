import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    rpc: (name: string, ...args: unknown[]) =>
      name === 'has_accepted_current_terms'
        ? Promise.resolve({ data: true, error: null })
        : mocks.rpc(name, ...args),
  }),
}))
import { app } from './app'
import { signUsage, type UsageReceipt } from './lib/ai-usage'
const user = '11111111-1111-4111-8111-111111111111'
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'key',
  OPENROUTER_API_KEY: 'secret',
}
const receipt: UsageReceipt = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: user,
  gameId: '33333333-3333-4333-8333-333333333333',
  operation: 'transcription',
  model: 'test',
  outcome: 'succeeded',
  providerRequestId: 'gen-test',
  costUsd: '0.001000000000',
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 15,
  audioSeconds: 8,
}
async function row(value = receipt) {
  return {
    id: value.id,
    requester_id: value.userId,
    game_id: value.gameId,
    operation: value.operation,
    created_at: '2026-10-02T10:00:00Z',
    receipt: await signUsage('secret', value),
  }
}
beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: user } }, error: null })
  mocks.rpc.mockReset()
})
const request = (query = '') =>
  app.request('/api/ai-usage' + query, { headers: { Authorization: 'Bearer token' } }, env)
it('returns verified costs separately and preserves unknown counts', async () => {
  mocks.rpc.mockResolvedValue({
    data: [
      await row(),
      await row({ ...receipt, id: crypto.randomUUID(), operation: 'cards', costUsd: null }),
    ],
    error: null,
  })
  const response = await request('?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    data: {
      currency: 'USD',
      pageTotals: {
        recordedAttempts: 2,
        knownCostUsd: '0.001000000000',
        unknownCostCount: 1,
        transcriptionCostUsd: '0.001000000000',
        sharedCardCostUsd: '0.000000000000',
      },
      nextCursor: null,
    },
  })
})
it('excludes forged and cross-account receipts', async () => {
  const forged = await row()
  forged.receipt = { payload: '{}', signature: 'a'.repeat(64) }
  mocks.rpc.mockResolvedValue({
    data: [forged, await row({ ...receipt, userId: crypto.randomUUID() })],
    error: null,
  })
  expect(await (await request()).json()).toMatchObject({
    data: { entries: [], pageTotals: { unverifiedCount: 2, knownCostUsd: '0.000000000000' } },
  })
})
it('rejects invalid ranges and requires a session', async () => {
  expect((await request('?from=bad')).status).toBe(400)
  expect((await app.request('/api/ai-usage', {}, env)).status).toBe(401)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('returns page totals and a stable cursor instead of silently truncating history', async () => {
  const rows = await Promise.all(
    Array.from({ length: 101 }, () => row({ ...receipt, id: crypto.randomUUID() })),
  )
  mocks.rpc.mockResolvedValue({ data: rows, error: null })
  const result = await (await request()).json()
  expect(result.data.entries).toHaveLength(100)
  expect(result.data.pageTotals.knownCostUsd).toBe('0.100000000000')
  expect(result.data.nextCursor.beforeId).toBe(rows[99]!.id)
})
