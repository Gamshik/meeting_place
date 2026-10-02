import { createUsageRecorder, type UsageRecorder } from './ai-usage'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../../shared/database.types'
import { z } from 'zod'
import { OpenRouterError } from './openrouter'

const reservationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('reserved'), id: z.uuid() }),
  z.object({ status: z.literal('cached'), result: z.unknown() }),
  z.object({ status: z.literal('processing'), retryAfter: z.number().int().positive() }),
  z.object({ status: z.literal('conflict') }),
])

export class GameAiError extends Error {
  constructor(
    readonly kind: 'processing' | 'conflict' | 'unavailable' | 'upload_failed',
    readonly retryAfter?: number,
  ) {
    super('The AI action could not be completed.')
  }
}

export async function runGameAi<T>(
  supabase: SupabaseClient<Database>,
  input: {
    requesterId: string
    gameId: string
    roundId: string | null
    operation: 'cards' | 'transcription'
    fingerprint: string
  },
  schema: z.ZodType<T>,
  work: (signal: AbortSignal, usage: UsageRecorder) => Promise<T>,
  signingKey: string | undefined,
  usageSigningKey = signingKey,
): Promise<T> {
  if (!signingKey) throw new OpenRouterError('OpenRouter is not configured.', 'not_configured')
  const signal = AbortSignal.timeout(90_000)
  const token = crypto.randomUUID()
  const { data, error } = await supabase.rpc('reserve_my_game_ai', {
    p_game_id: input.gameId,
    p_round_id: input.roundId,
    p_operation: input.operation,
    p_fingerprint: input.fingerprint,
    p_token: token,
  })
  if (error) throw new GameAiError('unavailable')
  const parsed = reservationSchema.safeParse(data)
  if (!parsed.success) throw new GameAiError('unavailable')
  const reservation = parsed.data
  if (reservation.status === 'cached') {
    const cached = schema.safeParse(await verifyResult(signingKey, input, reservation.result))
    if (!cached.success) throw new GameAiError('unavailable')
    return cached.data
  }
  if (reservation.status !== 'reserved') {
    throw new GameAiError(
      reservation.status,
      'retryAfter' in reservation ? reservation.retryAfter : undefined,
    )
  }
  let result: T
  try {
    signal.throwIfAborted()
    result = schema.parse(
      await work(
        signal,
        createUsageRecorder(supabase, usageSigningKey!, {
          userId: input.requesterId,
          gameId: input.gameId,
          operation: input.operation,
          jobId: reservation.id,
          token,
        }),
      ),
    )
    signal.throwIfAborted()
  } catch (error) {
    // A provider response confirms completion/failure. A timeout or network error
    // does not: keep that lease until expiry rather than immediately duplicating work.
    if (
      error instanceof OpenRouterError ||
      (error instanceof GameAiError && error.kind === 'upload_failed')
    ) {
      await supabase
        .rpc('finish_my_game_ai', { p_id: reservation.id, p_token: token, p_result: null })
        .then(
          () => undefined,
          () => undefined,
        )
    }
    throw error
  }
  // Do not mark failed if saving is uncertain: it may have committed successfully.
  const envelope = await signResult(signingKey, input, result)
  const finished = await supabase.rpc('finish_my_game_ai', {
    p_id: reservation.id,
    p_token: token,
    p_result: envelope as Json,
  })
  if (finished.error || finished.data !== true) throw new GameAiError('unavailable')
  return result
}

// Authenticated clients can call RPCs, so cached results must prove Worker origin.
// Bind the signature to the actor, turn, operation, and input to prevent replay.
async function keyFor(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}
function payload(input: unknown, result: string) {
  return new TextEncoder().encode(JSON.stringify(['meeting-place-ai-v1', input, result]))
}
async function signResult(secret: string, input: unknown, value: unknown) {
  const result = JSON.stringify(value)
  const signature = await crypto.subtle.sign('HMAC', await keyFor(secret), payload(input, result))
  return {
    result,
    signature: Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
  }
}
async function verifyResult(secret: string, input: unknown, value: unknown) {
  const envelope = z
    .object({ result: z.string(), signature: z.string().regex(/^[a-f0-9]{64}$/) })
    .safeParse(value)
  if (!envelope.success) throw new GameAiError('unavailable')
  const signature = Uint8Array.from(envelope.data.signature.match(/../g)!, (byte) =>
    parseInt(byte, 16),
  )
  if (
    !(await crypto.subtle.verify(
      'HMAC',
      await keyFor(secret),
      signature,
      payload(input, envelope.data.result),
    ))
  ) {
    throw new GameAiError('unavailable')
  }
  try {
    return JSON.parse(envelope.data.result) as unknown
  } catch {
    throw new GameAiError('unavailable')
  }
}
