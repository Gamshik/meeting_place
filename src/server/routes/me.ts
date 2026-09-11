import { Hono } from 'hono'

import { updateProfileSchema, type Profile } from '../../shared/contracts'
import { errorResponse } from '../lib/responses'
import type { AppEnvironment } from '../types'

export const meRoutes = new Hono<AppEnvironment>()

meRoutes.get('/', async (context) => {
  const supabase = context.get('supabase')
  const user = context.get('user')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, created_at')
    .eq('id', user.id)
    .single()

  if (error || !data) {
    console.error('Could not load profile', error)
    return errorResponse(context, 500, 'profile_load_failed', 'We could not load your profile.')
  }

  const profile: Profile = {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    createdAt: data.created_at,
  }

  return context.json({ data: profile })
})

meRoutes.patch('/', async (context) => {
  const body: unknown = await context.req.json().catch(() => null)
  const parsed = updateProfileSchema.safeParse(body)

  if (!parsed.success) {
    return errorResponse(
      context,
      400,
      'invalid_profile',
      'Check the profile details and try again.',
      parsed.error.flatten(),
    )
  }

  const supabase = context.get('supabase')
  const user = context.get('user')
  const values = {
    ...(parsed.data.username === undefined ? {} : { username: parsed.data.username }),
    ...(parsed.data.displayName === undefined ? {} : { display_name: parsed.data.displayName }),
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(values)
    .eq('id', user.id)
    .select('id, username, display_name, avatar_url, created_at')
    .single()

  if (error || !data) {
    const isDuplicateUsername = error?.code === '23505'
    return errorResponse(
      context,
      isDuplicateUsername ? 409 : 500,
      isDuplicateUsername ? 'username_taken' : 'profile_update_failed',
      isDuplicateUsername ? 'That username is already taken.' : 'We could not update your profile.',
    )
  }

  const profile: Profile = {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    createdAt: data.created_at,
  }

  return context.json({ data: profile })
})
