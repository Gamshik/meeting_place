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

export const partnershipListSchema = z
  .object({
    beforeCreatedAt: z.iso.datetime({ offset: true }).optional(),
    beforeId: z.uuid().optional(),
  })
  .refine((value) => Boolean(value.beforeCreatedAt) === Boolean(value.beforeId), {
    message: 'Provide both cursor fields',
  })

export const wordGameActionSchema = z.object({
  partnershipId: z.uuid(),
})

export const createWordRoundSchema = z.object({
  topic: z.string().trim().min(2).max(40),
})

export const guessWordRoundSchema = z.object({
  guess: z.string().trim().min(1).max(80),
})

export const wordTranscriptSchema = z.object({
  word: z.string().min(1).max(80),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  speaker: z.number().int().nonnegative().optional(),
})

export const wordGameRoundSchema = z.object({
  id: z.uuid(),
  turnNumber: z.number().int().positive(),
  explainerId: z.uuid(),
  topic: z.string(),
  status: z.enum(['explaining', 'awaiting_guess', 'completed', 'skipped']),
  secretWord: z.string().nullable(),
  forbiddenWords: z.array(z.string()).nullable(),
  transcript: z.string().nullable(),
  transcriptWords: z.array(wordTranscriptSchema),
  audioAvailable: z.boolean(),
  usedForbiddenWord: z.boolean().nullable(),
  guess: z.string().nullable(),
  isCorrect: z.boolean().nullable(),
  score: z.number().int().min(0).max(1).nullable(),
  coachScore: z.number().int().min(0).max(100).nullable(),
  coachFeedback: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})

export const wordGameSchema = z.object({
  id: z.uuid(),
  partnershipId: z.uuid(),
  status: z.enum(['pending', 'active', 'paused', 'finished']),
  requestedById: z.uuid(),
  acceptedAt: z.string().nullable(),
  pausedAt: z.string().nullable().optional(),
  reconnectDeadline: z.string().nullable().optional(),
  disconnectedPlayerId: z.uuid().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  currentPlayerId: z.uuid(),
  partner: z.object({
    id: z.uuid(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  scores: z.object({
    you: z.number().int().nonnegative(),
    partner: z.number().int().nonnegative(),
  }),
  round: wordGameRoundSchema.nullable(),
})

export const wordGameSummarySchema = z.object({
  partnershipId: z.uuid(),
  status: z.enum(['pending', 'active', 'paused', 'finished']),
  requestedById: z.uuid(),
})

export type WordGame = z.infer<typeof wordGameSchema>
export type WordGameRound = z.infer<typeof wordGameRoundSchema>
export type WordGameSummary = z.infer<typeof wordGameSummarySchema>

export const invitationResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), partnershipId: z.uuid() }),
  z.object({ ok: z.literal(false), code: z.string() }),
])

export const apiErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
})

export type PartnershipCursor = { createdAt: string; id: string }
export type PartnershipPage = { data: Partnership[]; nextCursor: PartnershipCursor | null }

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
