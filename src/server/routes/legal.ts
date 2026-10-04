import { Hono } from 'hono'
import { acceptTermsSchema, legalStatusSchema } from '../../shared/legal'
import { errorResponse } from '../lib/responses'
import type { AppEnvironment } from '../types'

export const legalRoutes = new Hono<AppEnvironment>()
legalRoutes.get('/', async (context) => {
  const { data, error } = await context.get('supabase').rpc('get_my_legal_status')
  const parsed = legalStatusSchema.safeParse(data)
  if (error || !parsed.success)
    return errorResponse(
      context,
      503,
      'legal_status_unavailable',
      'We could not check your account confirmation. Try again.',
    )
  return context.json({ data: parsed.data })
})
legalRoutes.post('/', async (context) => {
  const parsed = acceptTermsSchema.safeParse(await context.req.json().catch(() => null))
  if (!parsed.success)
    return errorResponse(
      context,
      400,
      'invalid_terms_acceptance',
      'Confirm that you are 18 or older and accept the current Terms.',
    )
  const { error } = await context.get('supabase').rpc('accept_my_terms', {
    p_adult: parsed.data.adult,
    p_accept_terms: parsed.data.acceptTerms,
    p_version: parsed.data.termsVersion,
  })
  if (error)
    return errorResponse(
      context,
      503,
      'terms_acceptance_failed',
      'Your confirmation could not be saved. Try again.',
    )
  return context.body(null, 204)
})
