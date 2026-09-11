import { z } from 'zod'

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must contain at least 3 characters')
  .max(32, 'Username cannot exceed 32 characters')
  .regex(/^[a-z0-9_]+$/, 'Use only lowercase letters, numbers, and underscores')

export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => value.username !== undefined || value.displayName !== undefined, {
    message: 'Provide at least one profile field',
  })

export const invitePartnerSchema = z.object({
  username: usernameSchema,
})

export const partnershipActionSchema = z.object({
  partnershipId: z.string().uuid(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type InvitePartnerInput = z.infer<typeof invitePartnerSchema>

export type Profile = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  createdAt: string
}

export type Partnership = {
  id: string
  status: 'pending' | 'active'
  direction: 'incoming' | 'outgoing'
  partner: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
  }
  createdAt: string
  acceptedAt: string | null
}

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
