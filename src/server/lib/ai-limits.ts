import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/database.types'
import { verifyUsage } from './ai-usage'

export class AiLimitError extends Error {
  constructor(readonly kind: 'credits_exhausted' | 'limits_unavailable') {
    super(kind)
  }
}

function units(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole!) * 1000000000000n + BigInt(fraction.padEnd(12, '0'))
}

export async function assertAiCredits(
  db: SupabaseClient<Database>,
  secret: string,
  userId: string,
  now = new Date(),
) {
  try {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    let lifetime = 0n,
      monthly = 0n
    let cursor: { p_before_created_at: string; p_before_id: string } | undefined
    for (let batch = 0; ; batch++) {
      if (batch >= 500) throw new AiLimitError('limits_unavailable')
      const result = await db.rpc('list_my_ai_usage', {
        p_from: '1970-01-01T00:00:00.000Z',
        p_to: now.toISOString(),
        ...cursor,
      })
      if (result.error) throw new AiLimitError('limits_unavailable')
      const rows = result.data ?? []
      for (const row of rows.slice(0, 100)) {
        const receipt = await verifyUsage(secret, row.receipt)
        if (
          !receipt ||
          receipt.userId !== userId ||
          receipt.userId !== row.requester_id ||
          receipt.id !== row.id ||
          receipt.gameId !== row.game_id ||
          receipt.operation !== row.operation ||
          receipt.costUsd === null
        )
          continue
        const cost = units(receipt.costUsd)
        lifetime += cost
        if (Date.parse(row.created_at) >= Date.parse(month)) monthly += cost
      }
      if (rows.length <= 100) break
      const last = rows[99]!
      cursor = { p_before_created_at: last.created_at, p_before_id: last.id }
    }
    {
      const decimal = (amount: bigint) =>
        `${amount / 1000000000000n}.${(amount % 1000000000000n).toString().padStart(12, '0')}`
      const result = await db.rpc('check_my_ai_credits', {
        p_lifetime_usd: decimal(lifetime),
        p_monthly_usd: decimal(monthly),
      })
      if (result.error || typeof result.data !== 'boolean')
        throw new AiLimitError('limits_unavailable')
      if (!result.data) throw new AiLimitError('credits_exhausted')
    }
  } catch (error) {
    if (error instanceof AiLimitError) throw error
    throw new AiLimitError('limits_unavailable')
  }
}
