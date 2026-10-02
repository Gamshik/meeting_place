import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Database } from '../../shared/database.types'
import {
  createUsageRecorder,
  readUsage,
  signUsage,
  sumCosts,
  verifyUsage,
  type UsageReceipt,
} from './ai-usage'
import { generateGameWords, transcribeExplanation } from './openrouter'
import { runGameAi } from './game-ai'
import { transcriptionSchema } from './openrouter'

const rpc = vi.fn()
const client = { rpc } as unknown as SupabaseClient<Database>
const secret = 'test-signing-secret'
const context = {
  userId: '11111111-1111-4111-8111-111111111111',
  gameId: '22222222-2222-4222-8222-222222222222',
  jobId: '33333333-3333-4333-8333-333333333333',
  token: '44444444-4444-4444-8444-444444444444',
  operation: 'transcription' as const,
}
const config = () => ({
  apiKey: 'test-key',
  textModel: 'test-model',
  usage: createUsageRecorder(client, secret, context),
})
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true, error: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('records transcription cost and duration before stripping response metadata', async () => {
  const provider = vi.fn().mockResolvedValue(
    Response.json(
      {
        text: 'A document.',
        words: [],
        usage: {
          cost: 0.000508,
          seconds: 9.2,
          input_tokens: 83,
          output_tokens: 30,
          total_tokens: 113,
        },
      },
      { headers: { 'X-Generation-Id': 'gen-transcription' } },
    ),
  )
  vi.stubGlobal('fetch', provider)
  expect(await transcribeExplanation(config(), 'audio', 'wav')).toEqual({
    text: 'A document.',
    words: [],
  })
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(provider.mock.invocationCallOrder[0]!)
  const receipt = await verifyUsage(secret, rpc.mock.calls[1]?.[1].p_receipt)
  expect(receipt).toMatchObject({
    operation: 'transcription',
    costUsd: '0.000508000000',
    audioSeconds: 9.2,
    inputTokens: 83,
    outputTokens: 30,
    totalTokens: 113,
    providerRequestId: 'gen-transcription',
    outcome: 'succeeded',
  })
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('A document.')
})

it('records paid generation even if the model returns unusable cards', async () => {
  const usage = createUsageRecorder(client, secret, { ...context, operation: 'cards' })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        id: 'gen-card',
        usage: { cost: 0.001, prompt_tokens: 100, completion_tokens: 20 },
        choices: [{ message: { content: '{}' } }],
      }),
    ),
  )
  await expect(generateGameWords({ ...config(), usage }, 'Travel', [])).rejects.toThrow(
    'invalid data',
  )
  expect(await verifyUsage(secret, rpc.mock.calls[1]?.[1].p_receipt)).toMatchObject({
    operation: 'cards',
    providerRequestId: 'gen-card',
    costUsd: '0.001000000000',
    inputTokens: 100,
  })
})

it('does not treat missing usage or missing cost as free', () => {
  expect(readUsage(Response.json({}), {})).toMatchObject({ costUsd: null, inputTokens: null })
  expect(readUsage(Response.json({}), { usage: { total_tokens: 10 } }).costUsd).toBeNull()
  expect(readUsage(Response.json({}), { usage: { cost: 0 } }).costUsd).toBe('0.000000000000')
})
it('a cached retry adds neither another provider call nor another usage event', async () => {
  let savedResult: unknown
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'reserve_my_game_ai')
      return {
        data: savedResult
          ? { status: 'cached', result: savedResult }
          : { status: 'reserved', id: context.jobId },
        error: null,
      }
    if (name === 'finish_my_game_ai') savedResult = args.p_result
    return { data: true, error: null }
  })
  const provider = vi
    .fn()
    .mockImplementation(async () => Response.json({ text: 'A document.', usage: { cost: 0.001 } }))
  vi.stubGlobal('fetch', provider)
  const input = {
    requesterId: context.userId,
    gameId: context.gameId,
    roundId: context.jobId,
    operation: 'transcription' as const,
    fingerprint: 'same-audio',
  }
  const submit = () =>
    runGameAi(
      client,
      input,
      transcriptionSchema,
      (signal, usage) =>
        transcribeExplanation(
          { apiKey: 'test', textModel: undefined, usage },
          'audio',
          'wav',
          signal,
        ),
      secret,
    )
  expect(await submit()).toEqual(await submit())
  expect(provider).toHaveBeenCalledOnce()
  expect(rpc.mock.calls.filter((call) => call[0] === 'start_my_ai_usage')).toHaveLength(1)
  expect(rpc.mock.calls.filter((call) => call[0] === 'record_my_ai_usage')).toHaveLength(1)
})

it('retains an unknown attempt after a lost provider connection', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failed')))
  await expect(transcribeExplanation(config(), 'audio', 'wav')).rejects.toThrow('network failed')
  expect(rpc).toHaveBeenCalledOnce()
  expect(await verifyUsage(secret, rpc.mock.calls[0]?.[1].p_receipt)).toMatchObject({
    costUsd: null,
    outcome: 'unknown',
  })
})
it('records a provider 429 as failed with unknown cost and does not retry it', async () => {
  const provider = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { error: { code: 429, message: 'Provider returned 429' } },
        { status: 429, headers: { 'Retry-After': '45' } },
      ),
    )
  vi.stubGlobal('fetch', provider)
  await expect(transcribeExplanation(config(), 'audio', 'wav')).rejects.toMatchObject({
    kind: 'rate_limited',
    retryAfter: 45,
  })
  expect(provider).toHaveBeenCalledOnce()
  expect(await verifyUsage(secret, rpc.mock.calls[1]?.[1].p_receipt)).toMatchObject({
    outcome: 'failed',
    costUsd: null,
  })
})

it('keeps a generation ID when the response body is lost', async () => {
  const response = new Response('', { headers: { 'X-Generation-Id': 'gen-lost' } })
  vi.spyOn(response, 'json').mockRejectedValue(new TypeError('body lost'))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(transcribeExplanation(config(), 'audio', 'wav')).rejects.toThrow('body lost')
  expect(await verifyUsage(secret, rpc.mock.calls[1]?.[1].p_receipt)).toMatchObject({
    providerRequestId: 'gen-lost',
    costUsd: null,
  })
})

it('does not call AI if the initial accounting write fails', async () => {
  rpc.mockResolvedValue({ data: false, error: null })
  const provider = vi.fn()
  vi.stubGlobal('fetch', provider)
  await expect(transcribeExplanation(config(), 'audio', 'wav')).rejects.toThrow(
    'usage recording unavailable',
  )
  expect(provider).not.toHaveBeenCalled()
})

it('retries saving the same event without repeating the provider request', async () => {
  rpc
    .mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: null, error: {} })
  const provider = vi
    .fn()
    .mockResolvedValue(Response.json({ text: 'A document.', usage: { cost: 0.002 } }))
  vi.stubGlobal('fetch', provider)
  await transcribeExplanation(config(), 'audio', 'wav')
  expect(provider).toHaveBeenCalledOnce()
  expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[2])
})

it('ignores forged receipts and sums decimal costs exactly', async () => {
  const value: UsageReceipt = {
    id: context.jobId,
    userId: context.userId,
    gameId: context.gameId,
    operation: 'cards',
    model: 'test',
    outcome: 'succeeded',
    providerRequestId: null,
    costUsd: '0.100000000000',
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    audioSeconds: null,
  }
  const envelope = (await signUsage(secret, value)) as { payload: string; signature: string }
  expect(await verifyUsage(secret, envelope)).toEqual(value)
  envelope.payload = envelope.payload.replace('0.100000000000', '9.100000000000')
  expect(await verifyUsage(secret, envelope)).toBeNull()
  expect(sumCosts(['0.100000000000', '0.200000000000', null])).toBe('0.300000000000')
})
