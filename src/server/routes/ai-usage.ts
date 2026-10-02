import { Hono } from 'hono'
import { z } from 'zod'
import { sumCosts, verifyUsage, type UsageReceipt } from '../lib/ai-usage'
import { errorResponse } from '../lib/responses'
import type { AppEnvironment } from '../types'

export const aiUsageRoutes = new Hono<AppEnvironment>()
const querySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    beforeCreatedAt: z.iso.datetime({ offset: true }).optional(),
    beforeId: z.uuid().optional(),
  })
  .refine((value) => Date.parse(value.from) < Date.parse(value.to))
  .refine((value) => Boolean(value.beforeCreatedAt) === Boolean(value.beforeId))

aiUsageRoutes.get('/', async (context) => {
  const now = new Date()
  const query = querySchema.safeParse({
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    to: now.toISOString(),
    ...context.req.query(),
  })
  if (!query.success)
    return errorResponse(context, 400, 'invalid_usage_period', 'Choose a valid start and end date.')
  const secret = context.env.AI_USAGE_SIGNING_KEY ?? context.env.OPENROUTER_API_KEY
  if (!secret)
    return errorResponse(
      context,
      503,
      'usage_unavailable',
      'Usage reporting is temporarily unavailable.',
    )
  const { data, error } = await context.get('supabase').rpc('list_my_ai_usage', {
    p_from: query.data.from,
    p_to: query.data.to,
    p_before_created_at: query.data.beforeCreatedAt,
    p_before_id: query.data.beforeId,
  })
  if (error)
    return errorResponse(
      context,
      503,
      'usage_unavailable',
      'Usage reporting is temporarily unavailable.',
    )
  const page = (data ?? []).slice(0, 100)
  const entries: (UsageReceipt & { createdAt: string })[] = []
  let unverifiedCount = 0
  for (const row of page) {
    const receipt = await verifyUsage(secret, row.receipt)
    if (
      !receipt ||
      receipt.id !== row.id ||
      receipt.userId !== context.get('user').id ||
      receipt.userId !== row.requester_id ||
      receipt.gameId !== row.game_id ||
      receipt.operation !== row.operation
    ) {
      unverifiedCount++
      continue
    }
    entries.push({ ...receipt, createdAt: row.created_at })
  }
  const last = page.at(-1)
  return context.json({
    data: {
      entries,
      currency: 'USD',
      from: query.data.from,
      to: query.data.to,
      pageTotals: {
        recordedAttempts: entries.length,
        knownCostUsd: sumCosts(entries.map((entry) => entry.costUsd)),
        unknownCostCount: entries.filter((entry) => entry.costUsd === null).length,
        unverifiedCount,
        transcriptionCostUsd: sumCosts(
          entries
            .filter((entry) => entry.operation === 'transcription')
            .map((entry) => entry.costUsd),
        ),
        sharedCardCostUsd: sumCosts(
          entries.filter((entry) => entry.operation === 'cards').map((entry) => entry.costUsd),
        ),
      },
      nextCursor:
        (data?.length ?? 0) > 100 && last
          ? { beforeCreatedAt: last.created_at, beforeId: last.id }
          : null,
    },
  })
})
