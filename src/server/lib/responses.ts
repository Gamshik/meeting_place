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

const databaseMessages: Record<string, string> = {
  cannot_invite_yourself: 'You cannot invite yourself.',
  partnership_already_exists: 'You already have an invitation or partnership with this person.',
  partnership_not_found: 'This partnership was not found or cannot be changed.',
  pending_invitation_not_found: 'This pending invitation was not found or cannot be changed.',
  profile_not_found: 'No user with that username was found.',
}

export function databaseErrorMessage(code: string | undefined, fallback: string) {
  return (code && databaseMessages[code]) ?? fallback
}
