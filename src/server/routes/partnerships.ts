import { Hono, type Context } from 'hono'

import {
  invitePartnerSchema,
  invitationResultSchema,
  partnershipListSchema,
  partnershipActionSchema,
  type Partnership,
} from '../../shared/contracts'
import { databaseErrorResponse, domainErrorResponse, errorResponse } from '../lib/responses'
import type { AppEnvironment } from '../types'

export const partnershipRoutes = new Hono<AppEnvironment>()

partnershipRoutes.get('/', async (context) => {
  const supabase = context.get('supabase')
  const parsed = partnershipListSchema.safeParse(context.req.query())
  if (!parsed.success) return errorResponse(context, 400, 'invalid_cursor', 'Invalid page cursor.')
  const pageSize = 50
  const { data, error } = await supabase.rpc('list_my_partnerships', {
    p_before_created_at: parsed.data.beforeCreatedAt,
    p_before_id: parsed.data.beforeId,
    p_limit: pageSize + 1,
  })

  if (error) {
    console.error('Could not list partnerships', { code: error.code })
    return errorResponse(
      context,
      500,
      'partnerships_load_failed',
      'We could not load your learning partners.',
    )
  }

  const partnerships: Partnership[] = (data ?? []).slice(0, pageSize).map((item) => ({
    id: item.partnership_id,
    status: item.partnership_status === 'active' ? 'active' : 'pending',
    direction: item.invitation_direction === 'incoming' ? 'incoming' : 'outgoing',
    partner: {
      id: item.partner_id,
      username: item.partner_username,
      displayName: item.partner_display_name,
      avatarUrl: item.partner_avatar_url,
    },
    createdAt: item.created_at,
    acceptedAt: item.accepted_at,
  }))

  const last = partnerships.at(-1)
  return context.json({
    data: partnerships,
    nextCursor:
      (data?.length ?? 0) > pageSize && last ? { createdAt: last.createdAt, id: last.id } : null,
  })
})

partnershipRoutes.post('/invitations', async (context) => {
  const body: unknown = await context.req.json().catch(() => null)
  const parsed = invitePartnerSchema.safeParse(body)

  if (!parsed.success) {
    return errorResponse(
      context,
      400,
      'invalid_invitation',
      'Enter a valid username.',
      parsed.error.flatten(),
    )
  }

  const supabase = context.get('supabase')
  const { data, error } = await supabase.rpc('invite_partner', {
    p_target_username: parsed.data.username,
  })

  if (error) {
    return databaseErrorResponse(context, error)
  }
  const result = invitationResultSchema.safeParse(data)
  if (!result.success)
    return errorResponse(context, 500, 'invitation_failed', 'We could not send the invitation.')
  if (!result.data.ok) return domainErrorResponse(context, result.data.code)
  return context.json({ data: { partnershipId: result.data.partnershipId } }, 201)
})

partnershipRoutes.post('/:partnershipId/accept', async (context) => {
  return respondToInvitation(context, true)
})

partnershipRoutes.post('/:partnershipId/decline', async (context) => {
  return respondToInvitation(context, false)
})

partnershipRoutes.delete('/:partnershipId', async (context) => {
  const parsed = partnershipActionSchema.safeParse({
    partnershipId: context.req.param('partnershipId'),
  })

  if (!parsed.success) {
    return errorResponse(context, 400, 'invalid_partnership', 'Invalid partnership identifier.')
  }

  const supabase = context.get('supabase')
  const { error } = await supabase.rpc('end_partnership', {
    p_partnership_id: parsed.data.partnershipId,
  })

  if (error) {
    return databaseErrorResponse(context, error)
  }

  return context.body(null, 204)
})

async function respondToInvitation(context: Context<AppEnvironment>, accept: boolean) {
  const parsed = partnershipActionSchema.safeParse({
    partnershipId: context.req.param('partnershipId'),
  })

  if (!parsed.success) {
    return errorResponse(context, 400, 'invalid_partnership', 'Invalid partnership identifier.')
  }

  const supabase = context.get('supabase')
  const { error } = await supabase.rpc('respond_to_partnership', {
    p_accept: accept,
    p_partnership_id: parsed.data.partnershipId,
  })

  if (error) {
    return databaseErrorResponse(context, error)
  }

  return context.json({ data: { accepted: accept } })
}
