import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}))

import { app } from './app'

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-key' }
const viewerId = '11111111-1111-4111-8111-111111111111'
const profileId = '22222222-2222-4222-8222-222222222222'
const activity = {
  profile: {
    id: profileId,
    username: 'bob',
    displayName: 'Bob',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    timeZone: 'Europe/Minsk',
  },
  isOwner: false,
  year: 2026,
  startDate: '2025-09-14',
  endDate: '2026-09-13',
  timeZone: 'Europe/Minsk',
  totals: {
    activeDays: 1,
    interactionCount: 5,
    gamesPlayed: 1,
    gamesCompleted: 1,
    roundsStarted: 1,
    explanationsSubmitted: 1,
    guessesSubmitted: 1,
    speakingDurationSeconds: 13,
    topicsExplored: 2,
  },
  days: [
    {
      date: '2026-09-13',
      interactionCount: 5,
      intensity: 2,
      gamesRequested: 0,
      gamesAccepted: 1,
      roundsStarted: 1,
      explanationsSubmitted: 1,
      guessesSubmitted: 1,
      gamesCompleted: 1,
      gamesPlayed: 1,
      speakingDurationSeconds: 13,
      topics: ['Food', 'Travel'],
    },
  ],
}

function request(path: string) {
  return app.request(path, { headers: { Authorization: 'Bearer test-token' } }, env)
}

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: viewerId } }, error: null })
  mocks.rpc.mockReset().mockResolvedValue({ data: activity, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('profile activity API', () => {
  it('returns validated activity for an available profile', async () => {
    const response = await request(`/api/profiles/${profileId}/activity?year=2026`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: activity })
    expect(mocks.rpc).toHaveBeenCalledWith('get_profile_activity', {
      p_profile_id: profileId,
      p_year: 2026,
    })
  })

  it('rejects malformed profile activity parameters before querying', async () => {
    const response = await request('/api/profiles/not-a-profile/activity?year=1999')
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('hides unavailable profiles', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'profile_not_available' },
    })
    const response = await request(`/api/profiles/${profileId}/activity?year=2026`)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'profile_not_available' },
    })
  })

  it('rejects malformed database responses', async () => {
    mocks.rpc.mockResolvedValue({ data: { profile: {} }, error: null })
    const response = await request(`/api/profiles/${profileId}/activity?year=2026`)
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'profile_activity_load_failed' },
    })
  })
})
