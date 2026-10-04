import type { MiddlewareHandler } from 'hono'
import { errorResponse } from '../lib/responses'
import type { AppEnvironment } from '../types'

export const requireTerms: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const { data, error } = await context.get('supabase').rpc('has_accepted_current_terms')
  if (error || typeof data !== 'boolean')
    return errorResponse(
      context,
      503,
      'legal_status_unavailable',
      'Account confirmation is temporarily unavailable.',
    )
  if (!data)
    return errorResponse(
      context,
      403,
      'terms_acceptance_required',
      'Confirm that you are 18 or older and accept the Terms to continue.',
    )
  await next()
}
