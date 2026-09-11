import { createClient } from '@supabase/supabase-js'
import type { MiddlewareHandler } from 'hono'

import type { Database } from '../../shared/database.types'
import { errorResponse } from '../lib/responses'
import type { AppEnvironment } from '../types'

export const requireAuthentication: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const authorization = context.req.header('Authorization')
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null

  if (!accessToken) {
    return errorResponse(context, 401, 'authentication_required', 'Sign in to continue.')
  }

  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_ANON_KEY) {
    return errorResponse(
      context,
      500,
      'server_not_configured',
      'The server connection is not configured.',
    )
  }

  const supabase = createClient<Database>(context.env.SUPABASE_URL, context.env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken)

  if (error || !user) {
    return errorResponse(
      context,
      401,
      'invalid_session',
      'Your session has expired. Sign in again.',
    )
  }

  context.set('supabase', supabase)
  context.set('user', user)
  await next()
}
