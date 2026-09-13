import { Hono } from 'hono'

import { profileActivityRequestSchema, profileActivitySchema } from '../../shared/contracts'
import { errorResponse } from '../lib/responses'
import type { AppEnvironment } from '../types'

export const profileRoutes = new Hono<AppEnvironment>()

profileRoutes.get('/:profileId/activity', async (context) => {
  const parsed = profileActivityRequestSchema.safeParse({
    profileId: context.req.param('profileId'),
    year: context.req.query('year'),
  })

  if (!parsed.success) {
    return errorResponse(
      context,
      400,
      'invalid_profile_activity_request',
      'Choose a valid profile and year.',
    )
  }

  const supabase = context.get('supabase')
  const { data, error } = await supabase.rpc('get_profile_activity', {
    p_profile_id: parsed.data.profileId,
    p_year: parsed.data.year,
  })

  if (error) {
    if (error.code === 'P0001' && error.message === 'profile_not_available') {
      return errorResponse(
        context,
        404,
        'profile_not_available',
        'This profile is not available to you.',
      )
    }
    console.error('Could not load profile activity', { code: error.code })
    return errorResponse(
      context,
      500,
      'profile_activity_load_failed',
      'We could not load this practice activity.',
    )
  }

  const activity = profileActivitySchema.safeParse(data)
  if (!activity.success) {
    console.error('Invalid profile activity response')
    return errorResponse(
      context,
      500,
      'profile_activity_load_failed',
      'We could not load this practice activity.',
    )
  }

  return context.json({ data: activity.data })
})
