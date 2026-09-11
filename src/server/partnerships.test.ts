import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}))
import { app } from './app'
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-key' }
const id = '11111111-1111-4111-8111-111111111111'
function request(path: string, method = 'POST', body?: unknown) {
  return app.request(
    path,
    {
      method,
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  )
}
beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id } }, error: null })
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
describe('authenticated API', () => {
  it('rejects an invalid token without invoking the database', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } })
    expect((await request('/api/partnerships', 'GET')).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('distinguishes an Auth outage from invalid credentials', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } })
    expect((await request('/api/partnerships', 'GET')).status).toBe(503)
  })
  it.each(['/api/partnerships/not-a-uuid/accept', '/api/partnerships/not-a-uuid/decline'])(
    'validates identifiers at %s',
    async (path) => {
      expect((await request(path)).status).toBe(400)
      expect(mocks.rpc).not.toHaveBeenCalled()
    },
  )
  it('validates invitation bodies', async () => {
    expect((await request('/api/partnerships/invitations', 'POST', { username: '!' })).status).toBe(
      400,
    )
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('returns a created invitation', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, partnershipId: id }, error: null })
    const response = await request('/api/partnerships/invitations', 'POST', { username: ' Bob ' })
    expect(response.status).toBe(201)
    expect(mocks.rpc).toHaveBeenCalledWith('invite_partner', { p_target_username: 'bob' })
    expect(await response.json()).toEqual({ data: { partnershipId: id } })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
  it.each(['invitation_rate_limited', 'invitation_cooldown'])('maps %s to 429', async (code) => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, code }, error: null })
    const response = await request('/api/partnerships/invitations', 'POST', { username: 'bob' })
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: { code } })
  })
  it.each([
    ['/api/partnerships/invitations', 'POST', { username: 'bob' }],
    [`/api/partnerships/${id}/accept`, 'POST', undefined],
    [`/api/partnerships/${id}`, 'DELETE', undefined],
  ] as const)('hides infrastructure failures at %s', async (path, method, body) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'private internal schema and connection details' },
    })
    const response = await request(path, method, body)
    expect(response.status).toBe(500)
    const result = await response.text()
    expect(result).not.toContain('private internal')
    expect(result).toContain('partnership_operation_failed')
  })
  it('maps expected missing-partnership exceptions without leaking details', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'partnership_not_found' },
    })
    expect((await request(`/api/partnerships/${id}`, 'DELETE')).status).toBe(404)
  })
  it('rejects malformed invitation RPC responses', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null })
    expect(
      (await request('/api/partnerships/invitations', 'POST', { username: 'bob' })).status,
    ).toBe(500)
  })
  it('rejects incomplete cursors before a database call', async () => {
    expect((await request(`/api/partnerships?beforeId=${id}`, 'GET')).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('returns a bounded page and a cursor from the last visible row', async () => {
    const data = Array.from({ length: 51 }, (_, i) => ({
      partnership_id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      partnership_status: 'pending',
      invitation_direction: 'incoming',
      partner_id: id,
      partner_username: 'bob',
      partner_display_name: 'Bob',
      partner_avatar_url: null,
      created_at: '2026-01-01T00:00:00+00:00',
      accepted_at: null,
    }))
    mocks.rpc.mockResolvedValue({ data, error: null })
    const response = await request('/api/partnerships', 'GET')
    const result = (await response.json()) as { data: unknown[]; nextCursor: unknown }
    expect(result.data).toHaveLength(50)
    expect(result.nextCursor).toEqual({
      id: data[49]!.partnership_id,
      createdAt: data[49]!.created_at,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('list_my_partnerships', {
      p_limit: 51,
      p_before_created_at: undefined,
      p_before_id: undefined,
    })
  })
})
