import { Hono, type Context } from 'hono'

import {
  invitePartnerSchema,
  partnershipActionSchema,
  type Partnership,
} from '../../shared/contracts'
import { databaseErrorMessage, errorResponse } from '../lib/responses'
import type { AppEnvironment } from '../types'

export const partnershipRoutes = new Hono<AppEnvironment>()

partnershipRoutes.get('/', async (context) => {
  const supabase = context.get('supabase')
  const { data, error } = await supabase.rpc('list_my_partnerships')

  if (error) {
    console.error('Could not list partnerships', error)
    return errorResponse(
      context,
      500,
      'partnerships_load_failed',
      'We could not load your learning partners.',
    )
  }

  const partnerships: Partnership[] = (data ?? []).map((item) => ({
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

  return context.json({ data: partnerships })
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
    const knownError = error.message.split('\n')[0] ?? 'invitation_failed'
    const status = knownError === 'partnership_already_exists' ? 409 : 400
    return errorResponse(
      context,
      status,
      knownError,
      databaseErrorMessage(knownError, 'We could not send the invitation.'),
    )
  }

  return context.json({ data: { partnershipId: data } }, 201)
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
    const code = error.message.split('\n')[0] ?? 'partnership_update_failed'
    return errorResponse(
      context,
      404,
      code,
      databaseErrorMessage(code, 'We could not update this partnership.'),
    )
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
    const code = error.message.split('\n')[0] ?? 'invitation_response_failed'
    return errorResponse(
      context,
      404,
      code,
      databaseErrorMessage(code, 'We could not respond to this invitation.'),
    )
  }

  return context.json({ data: { accepted: accept } })
}
