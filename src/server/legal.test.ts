import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}))
import { app } from './app'
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test' }
const headers = { Authorization: 'Bearer test', 'Content-Type': 'application/json' }
beforeEach(() => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'alice' } }, error: null })
  mocks.rpc.mockReset()
})
it('blocks app APIs until current Terms are accepted', async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null })
  const response = await app.request('/api/games/explain-word', { headers }, env)
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ error: { code: 'terms_acceptance_required' } })
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it('fails closed when the acceptance check is unavailable', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } })
  expect((await app.request('/api/partnerships', { headers }, env)).status).toBe(503)
})
it.each([
  { adult: false, acceptTerms: true, termsVersion: '2026-10-04' },
  { adult: true, acceptTerms: false, termsVersion: '2026-10-04' },
  { adult: true, acceptTerms: true, termsVersion: 'old' },
  { adult: true, acceptTerms: true, termsVersion: '2026-10-04', userId: 'someone-else' },
])('rejects invalid or forged acceptance %j', async (body) => {
  expect(
    (await app.request('/api/legal', { method: 'POST', headers, body: JSON.stringify(body) }, env))
      .status,
  ).toBe(400)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('saves valid confirmation using the authenticated user in the database', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null })
  expect(
    (
      await app.request(
        '/api/legal',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ adult: true, acceptTerms: true, termsVersion: '2026-10-04' }),
        },
        env,
      )
    ).status,
  ).toBe(204)
  expect(mocks.rpc).toHaveBeenCalledWith('accept_my_terms', {
    p_adult: true,
    p_accept_terms: true,
    p_version: '2026-10-04',
  })
})
