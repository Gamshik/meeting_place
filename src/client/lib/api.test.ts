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

  it('lets the browser set the multipart boundary for audio uploads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          id: '44444444-4444-4444-8444-444444444444',
          partnershipId: '33333333-3333-4333-8333-333333333333',
          currentPlayerId: '11111111-1111-4111-8111-111111111111',
          partner: {
            id: '22222222-2222-4222-8222-222222222222',
            username: 'bob',
            displayName: 'Bob',
            avatarUrl: null,
          },
          scores: { you: 0, partner: 0 },
          round: null,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await api.submitWordExplanation(
      '33333333-3333-4333-8333-333333333333',
      '55555555-5555-4555-8555-555555555555',
      new Blob(['audio'], { type: 'audio/wav' }),
    )
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers)
    expect(headers.has('Content-Type')).toBe(false)
  })
})
