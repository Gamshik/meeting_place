import { beforeEach, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/database.types'
import { assertAiCredits } from './ai-limits'
import { signUsage, type UsageReceipt } from './ai-usage'

const user = '11111111-1111-4111-8111-111111111111'
const secret = 'limit-key'
const now = new Date('2026-10-03T12:00:00Z')
const rpc = vi.fn()
const db = { rpc } as unknown as SupabaseClient<Database>
beforeEach(() => rpc.mockReset())
async function row(
  cost: string | null,
  date = '2026-10-02T12:00:00Z',
  operation: 'cards' | 'transcription' = 'cards',
) {
  const value: UsageReceipt = {
    id: crypto.randomUUID(),
    userId: user,
    gameId: crypto.randomUUID(),
    operation,
    model: 'test',
    outcome: 'succeeded',
    providerRequestId: null,
    costUsd: cost,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    audioSeconds: null,
  }
  return {
    id: value.id,
    requester_id: user,
    game_id: value.gameId,
    operation,
    created_at: date,
    receipt: await signUsage(secret, value),
  }
}

it.each([true, false])(
  'uses verified lifetime and UTC month costs (allowed: %s)',
  async (allowed) => {
    rpc
      .mockResolvedValueOnce({
        data: [
          await row('0.100000000000', '2026-09-30T23:59:59Z'),
          await row('0.050000000000', undefined, 'transcription'),
        ],
      })
      .mockResolvedValueOnce({ data: allowed })
    const result = assertAiCredits(db, secret, user, now)
    if (allowed) await expect(result).resolves.toBeUndefined()
    else await expect(result).rejects.toMatchObject({ kind: 'credits_exhausted' })
    expect(rpc).toHaveBeenLastCalledWith('check_my_ai_credits', {
      p_lifetime_usd: '0.150000000000',
      p_monthly_usd: '0.050000000000',
    })
  },
)
it('checks complete history past the first page', async () => {
  const entries = await Promise.all(Array.from({ length: 101 }, () => row('0.010000000000')))
  rpc
    .mockResolvedValueOnce({ data: entries })
    .mockResolvedValueOnce({ data: [entries[100]] })
    .mockResolvedValueOnce({ data: true })
  await assertAiCredits(db, secret, user, now)
  expect(rpc).toHaveBeenLastCalledWith('check_my_ai_credits', {
    p_lifetime_usd: '1.010000000000',
    p_monthly_usd: '1.010000000000',
  })
})
it('excludes unknown, forged, and mismatched receipts', async () => {
  rpc
    .mockResolvedValueOnce({
      data: [
        await row(null),
        { ...(await row('9.000000000000')), receipt: {} },
        { ...(await row('9.000000000000')), requester_id: 'other' },
      ],
    })
    .mockResolvedValueOnce({ data: true })
  await assertAiCredits(db, secret, user, now)
  expect(rpc).toHaveBeenLastCalledWith('check_my_ai_credits', {
    p_lifetime_usd: '0.000000000000',
    p_monthly_usd: '0.000000000000',
  })
})
it('fails closed on database failure', async () => {
  rpc.mockResolvedValue({ error: { code: 'offline' } })
  await expect(assertAiCredits(db, secret, user, now)).rejects.toMatchObject({
    kind: 'limits_unavailable',
  })
  rpc
    .mockReset()
    .mockResolvedValueOnce({ data: [] })
    .mockResolvedValueOnce({ error: { code: 'offline' } })
  await expect(assertAiCredits(db, secret, user, now)).rejects.toMatchObject({
    kind: 'limits_unavailable',
  })
})
