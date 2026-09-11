import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { ApiErrorBody } from '../../shared/contracts'

export function errorResponse(
  context: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  }

  return context.json(body, status)
}

const domainErrors = new Map<string, [ContentfulStatusCode, string]>([
  ['cannot_invite_yourself', [400, 'You cannot invite yourself.']],
  ['invalid_username', [400, 'Enter a valid username.']],
  [
    'partnership_already_exists',
    [409, 'You already have an invitation or partnership with this person.'],
  ],
  ['partnership_not_found', [404, 'This partnership was not found or cannot be changed.']],
  [
    'pending_invitation_not_found',
    [404, 'This pending invitation was not found or cannot be changed.'],
  ],
  ['profile_not_found', [404, 'No user with that username was found.']],
  [
    'invitation_rate_limited',
    [429, 'You have made too many invitation attempts. Try again in an hour.'],
  ],
  [
    'invitation_cooldown',
    [
      429,
      'Wait seven days after a partnership ends or an invitation is declined before inviting this person again.',
    ],
  ],
])

export function domainErrorResponse(context: Context, code: string) {
  const known = domainErrors.get(code)
  if (known) return errorResponse(context, known[0], code, known[1])
  console.error('Unknown partnership domain error')
  return errorResponse(
    context,
    500,
    'partnership_operation_failed',
    'We could not complete this request.',
  )
}

export function databaseErrorResponse(context: Context, error: { code?: string; message: string }) {
  if (error.code === 'P0001' && domainErrors.has(error.message)) {
    return domainErrorResponse(context, error.message)
  }
  // Log the infrastructure code, never database text, tokens, or request bodies.
  console.error('Partnership database operation failed', { code: error.code })
  return errorResponse(
    context,
    500,
    'partnership_operation_failed',
    'We could not complete this request.',
  )
}
