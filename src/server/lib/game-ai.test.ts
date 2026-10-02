import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/database.types'
import { beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { GameAiError, runGameAi } from './game-ai'
import { OpenRouterError } from './openrouter'
const rpc = vi.fn()
const client = { rpc } as unknown as SupabaseClient<Database>
const input = {
  requesterId: 'user',
  gameId: 'game',
  roundId: null,
  operation: 'cards' as const,
  fingerprint: 'Travel',
}
const id = '11111111-1111-4111-8111-111111111111'
const schema = z.object({ value: z.string() })
const value = { value: 'paid result' }
const work = vi.fn()
const key = 'worker-only-secret'
beforeEach(() => {
  rpc
    .mockReset()
    .mockResolvedValueOnce({ data: { status: 'reserved', id }, error: null })
    .mockResolvedValue({ data: true, error: null })
  work.mockReset().mockResolvedValue(value)
})
it('reserves over authenticated HTTPS, supplies a private token, and signs cached results', async () => {
  await expect(runGameAi(client, input, schema, work, key)).resolves.toEqual(value)
  expect(rpc).toHaveBeenNthCalledWith(
    1,
    'reserve_my_game_ai',
    expect.objectContaining({ p_game_id: 'game', p_token: expect.any(String) }),
  )
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(work.mock.invocationCallOrder[0]!)
  expect(rpc.mock.calls[1]?.[1].p_token).toBe(rpc.mock.calls[0]?.[1].p_token)
  expect(rpc.mock.calls[1]?.[1].p_result).toMatchObject({
    result: JSON.stringify(value),
    signature: expect.any(String),
  })
})
it.each(['processing', 'conflict'])('blocks work when %s', async (status) => {
  rpc.mockReset().mockResolvedValue({ data: { status, retryAfter: 120 }, error: null })
  await expect(runGameAi(client, input, schema, work, key)).rejects.toMatchObject({ kind: status })
  expect(work).not.toHaveBeenCalled()
})
it('reuses authentic cached results without calling the provider', async () => {
  await runGameAi(client, input, schema, work, key)
  const envelope = rpc.mock.calls[1]?.[1].p_result
  rpc.mockReset().mockResolvedValue({ data: { status: 'cached', result: envelope }, error: null })
  work.mockClear()
  await expect(runGameAi(client, input, schema, work, key)).resolves.toEqual(value)
  expect(work).not.toHaveBeenCalled()
})
it.each(['forged', 'other user', 'other round'])('rejects %s cached content', async (variation) => {
  await runGameAi(client, input, schema, work, key)
  const envelope = rpc.mock.calls[1]?.[1].p_result
  if (variation === 'forged') envelope.result = JSON.stringify({ value: 'attacker card' })
  rpc.mockReset().mockResolvedValue({ data: { status: 'cached', result: envelope }, error: null })
  work.mockClear()
  const changed = {
    ...input,
    ...(variation === 'other user' ? { requesterId: 'attacker' } : {}),
    ...(variation === 'other round' ? { roundId: 'different' } : {}),
  }
  await expect(runGameAi(client, changed, schema, work, key)).rejects.toBeInstanceOf(GameAiError)
  expect(work).not.toHaveBeenCalled()
})
it('fails closed if the RPC migration is missing', async () => {
  rpc.mockReset().mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
  await expect(runGameAi(client, input, schema, work, key)).rejects.toBeInstanceOf(GameAiError)
  expect(work).not.toHaveBeenCalled()
})
it('releases confirmed failures immediately', async () => {
  work.mockRejectedValue(new OpenRouterError('rejected', 'request_failed'))
  await expect(runGameAi(client, input, schema, work, key)).rejects.toThrow('rejected')
  expect(rpc).toHaveBeenLastCalledWith(
    'finish_my_game_ai',
    expect.objectContaining({ p_result: null }),
  )
})
it('retains reservations after uncertain failures', async () => {
  work.mockRejectedValue(new TypeError('network'))
  await expect(runGameAi(client, input, schema, work, key)).rejects.toThrow('network')
  expect(rpc).toHaveBeenCalledOnce()
})
it('rejects expired completion', async () => {
  rpc.mockResolvedValue({ data: false, error: null })
  await expect(runGameAi(client, input, schema, work, key)).rejects.toBeInstanceOf(GameAiError)
})
