import { Hono } from 'hono'
import { adminQuerySchema, type AdminReport, type AdminUser } from '../../shared/admin'
import { sumCosts, verifyUsage } from '../lib/ai-usage'
import { errorResponse } from '../lib/responses'
import type { AppEnvironment } from '../types'

export const adminRoutes = new Hono<AppEnvironment>()

adminRoutes.get('/users', async (context) => {
  const db = context.get('supabase')
  const unavailable = () =>
    errorResponse(
      context,
      503,
      'admin_report_unavailable',
      'The complete report could not be loaded. Try again or choose This month.',
    )
  const forbidden = () =>
    errorResponse(
      context,
      403,
      'admin_required',
      'This page is available only to the administrator.',
    )
  const access = await db.rpc('is_current_user_admin')
  if (access.error) return unavailable()
  if (access.data !== true) return forbidden()
  const query = adminQuerySchema.safeParse(context.req.query())
  if (!query.success)
    return errorResponse(
      context,
      400,
      'invalid_admin_query',
      'Choose a valid reporting period and page.',
    )
  const secret = context.env.AI_USAGE_SIGNING_KEY ?? context.env.OPENROUTER_API_KEY
  if (!secret) return unavailable()
  const now = new Date()
  const from =
    query.data.period === 'month'
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
      : '1970-01-01T00:00:00.000Z'
  const to = now.toISOString()
  const profiles = await db.rpc('admin_list_users', { p_after_id: query.data.afterId })
  if (profiles.error) return profiles.error.code === '42501' ? forbidden() : unavailable()
  const users: AdminUser[] = (profiles.data ?? []).slice(0, 20).map((user) => ({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    knownCostUsd: '0.000000000000',
    knownTokens: '0',
    knownAudioSeconds: 0,
    unknownAudioDurationCount: 0,
    unknownCostCount: 0,
    unknownTokenCount: 0,
    unverifiedCount: 0,
  }))
  const byId = new Map(users.map((user) => [user.id, user]))
  let afterId: string | undefined
  // Bound edge work. Never label a truncated scan as a complete total.
  if (users.length)
    for (let batch = 0; ; batch++) {
      if (batch >= 100) return unavailable()
      const result = await db.rpc('admin_list_usage', {
        p_user_ids: users.map((user) => user.id),
        p_from: from,
        p_to: to,
        p_after_id: afterId,
      })
      if (result.error) return result.error.code === '42501' ? forbidden() : unavailable()
      const rows = result.data ?? []
      for (const row of rows.slice(0, 500)) {
        const user = byId.get(row.requester_id)
        if (!user) return unavailable()
        const receipt = await verifyUsage(secret, row.receipt)
        if (
          !receipt ||
          receipt.id !== row.id ||
          receipt.userId !== row.requester_id ||
          receipt.gameId !== row.game_id ||
          receipt.operation !== row.operation
        ) {
          user.unverifiedCount++
          continue
        }
        user.knownCostUsd = sumCosts([user.knownCostUsd, receipt.costUsd])
        if (receipt.costUsd === null) user.unknownCostCount++
        if (receipt.operation === 'transcription') {
          if (receipt.audioSeconds === null) user.unknownAudioDurationCount++
          else user.knownAudioSeconds += receipt.audioSeconds
        } else {
          const tokens =
            receipt.totalTokens ??
            (receipt.inputTokens !== null && receipt.outputTokens !== null
              ? BigInt(receipt.inputTokens) + BigInt(receipt.outputTokens)
              : null)
          if (tokens === null) user.unknownTokenCount++
          else user.knownTokens = String(BigInt(user.knownTokens) + BigInt(tokens))
        }
      }
      if (rows.length <= 500) break
      afterId = rows[499]!.id
    }
  const report: AdminReport = {
    users,
    from,
    to,
    currency: 'USD',
    nextCursor: (profiles.data?.length ?? 0) > 20 ? users.at(-1)!.id : null,
  }
  return context.json({ data: report })
})
