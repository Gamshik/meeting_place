import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) },
  },
}))
import { api } from './api'
afterEach(() => vi.unstubAllGlobals())
describe('API error handling', () => {
  it.each([{}, { error: null }, { error: 'broken' }, { error: { message: 12 } }, null])(
    'handles unexpected JSON error shape %j',
    async (body) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status: 502 })))
      await expect(api.getProfile()).rejects.toMatchObject({
        name: 'ApiError',
        code: 'request_failed',
        status: 502,
      })
    },
  )
  it('handles a non-JSON gateway error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })))
    await expect(api.getProfile()).rejects.toMatchObject({ code: 'request_failed' })
  })
  it('preserves recognized API error details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'username_taken', message: 'Taken', details: { field: 'username' } } },
            { status: 409 },
          ),
        ),
    )
    await expect(api.updateProfile({ username: 'alice' })).rejects.toMatchObject({
      code: 'username_taken',
      message: 'Taken',
      details: { field: 'username' },
    })
  })
})
