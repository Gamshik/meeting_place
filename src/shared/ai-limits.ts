import { z } from 'zod'

const amount = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,12})?$/,
    'Enter a nonnegative USD amount with up to 12 decimal places.',
  )
  .nullable()
export const aiLimitsSchema = z.object({ monthlyUsd: amount, lifetimeUsd: amount }).strict()
export type AiLimits = z.infer<typeof aiLimitsSchema>
