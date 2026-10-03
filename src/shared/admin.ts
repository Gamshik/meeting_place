import { z } from 'zod'

export const adminQuerySchema = z.object({
  period: z.enum(['all', 'month']).default('all'),
  afterId: z.uuid().optional(),
})

export type AdminUser = {
  id: string
  username: string
  displayName: string
  knownCostUsd: string
  knownAudioSeconds: number
  unknownAudioDurationCount: number
  knownTokens: string
  unknownCostCount: number
  unknownTokenCount: number
  unverifiedCount: number
}

export type AdminReport = {
  users: AdminUser[]
  nextCursor: string | null
  from: string
  to: string
  currency: 'USD'
}
