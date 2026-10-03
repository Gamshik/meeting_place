import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database, Json } from '../../shared/database.types'

export const usageReceiptSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  gameId: z.uuid(),
  operation: z.enum(['cards', 'transcription']),
  model: z.string().min(1).max(200),
  providerRequestId: z.string().max(300).nullable(),
  outcome: z.enum(['unknown', 'succeeded', 'failed']),
  costUsd: z
    .string()
    .regex(/^\d{1,12}\.\d{12}$/)
    .nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  audioSeconds: z.number().nonnegative().nullable(),
})
export type UsageReceipt = z.infer<typeof usageReceiptSchema>
export type UsageRecorder = {
  start(model: string): Promise<void>
  finish(response: Response, body: unknown): Promise<void>
}

export function createUsageRecorder(
  supabase: SupabaseClient<Database>,
  secret: string,
  context: {
    userId: string
    gameId: string
    operation: 'cards' | 'transcription'
    jobId: string
    token: string
  },
  beforeStart?: () => Promise<void>,
): UsageRecorder {
  let receipt: UsageReceipt | undefined
  return {
    async start(model) {
      await beforeStart?.()
      receipt = {
        id: crypto.randomUUID(),
        userId: context.userId,
        gameId: context.gameId,
        operation: context.operation,
        model,
        providerRequestId: null,
        outcome: 'unknown',
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        audioSeconds: null,
      }
      const { data, error } = await supabase.rpc('start_my_ai_usage', {
        p_id: receipt.id,
        p_job_id: context.jobId,
        p_token: context.token,
        p_receipt: await signUsage(secret, receipt),
      })
      // Record intent before spending money; no provider call if accounting is unavailable.
      if (error || data !== true) throw new Error('AI usage recording unavailable')
    },
    async finish(response, body) {
      if (!receipt) throw new Error('AI usage recording was not started')
      receipt = {
        ...receipt,
        ...readUsage(response, body),
        outcome: response.ok ? 'succeeded' : 'failed',
      }
      const envelope = await signUsage(secret, receipt)
      // Idempotent retries update one event, never add another charge.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await supabase.rpc('record_my_ai_usage', {
            p_id: receipt.id,
            p_token: context.token,
            p_receipt: envelope,
          })
          if (!error && data === true) return
        } catch {
          /* The initial unknown-cost entry survives a failed final save. */
        }
      }
      console.error('AI usage final save failed', { eventId: receipt.id })
    },
  }
}

function nonnegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
function tokens(value: unknown) {
  const number = nonnegative(value)
  return number !== null && Number.isSafeInteger(number) ? number : null
}
export function readUsage(response: Response, body: unknown) {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const usage =
    record.usage && typeof record.usage === 'object'
      ? (record.usage as Record<string, unknown>)
      : {}
  const cost = nonnegative(usage.cost)
  const requestId =
    typeof record.id === 'string' ? record.id : response.headers.get('X-Generation-Id')
  return {
    providerRequestId: requestId?.slice(0, 300) ?? null,
    costUsd: cost !== null && cost < 1e12 ? cost.toFixed(12) : null,
    inputTokens: tokens(usage.input_tokens ?? usage.prompt_tokens),
    outputTokens: tokens(usage.output_tokens ?? usage.completion_tokens),
    totalTokens: tokens(usage.total_tokens),
    audioSeconds: nonnegative(usage.seconds),
  }
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}
function message(payload: string) {
  return new TextEncoder().encode('meeting-place-usage-v1\n' + payload)
}
export async function signUsage(secret: string, receipt: UsageReceipt): Promise<Json> {
  const payload = JSON.stringify(receipt)
  const bytes = await crypto.subtle.sign('HMAC', await signingKey(secret), message(payload))
  return {
    payload,
    signature: Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    ),
  }
}
export async function verifyUsage(secret: string, value: unknown): Promise<UsageReceipt | null> {
  const parsed = z
    .object({ payload: z.string(), signature: z.string().regex(/^[a-f0-9]{64}$/) })
    .safeParse(value)
  if (!parsed.success) return null
  const { payload, signature } = parsed.data
  const bytes = Uint8Array.from(signature.match(/../g)!, (byte) => parseInt(byte, 16))
  if (!(await crypto.subtle.verify('HMAC', await signingKey(secret), bytes, message(payload))))
    return null
  try {
    return usageReceiptSchema.parse(JSON.parse(payload))
  } catch {
    return null
  }
}

export function sumCosts(values: (string | null)[]) {
  const total = values.reduce(
    (sum, value) => sum + (value === null ? 0n : BigInt(value.replace('.', ''))),
    0n,
  )
  return `${total / 1000000000000n}.${(total % 1000000000000n).toString().padStart(12, '0')}`
}
