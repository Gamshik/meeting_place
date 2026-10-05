import { z } from 'zod'

export const TERMS_VERSION = '2026-10-04'
export const PRIVACY_VERSION = '2026-10-05'
export const PRIVACY_CONTACT = 'gkovsharov05@gmail.com'
export const OPERATOR_NAME = 'Kovsharov Gleb'
export const acceptTermsSchema = z
  .object({
    adult: z.literal(true),
    acceptTerms: z.literal(true),
    termsVersion: z.literal(TERMS_VERSION),
  })
  .strict()
export const legalStatusSchema = z.object({
  accepted: z.boolean(),
  termsVersion: z.string().nullable(),
  acceptedAt: z.string().nullable(),
})
export type LegalStatus = z.infer<typeof legalStatusSchema>
