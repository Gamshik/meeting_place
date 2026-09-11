import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  storageUpload: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    storage: {
      from: () => ({ createSignedUrl: mocks.createSignedUrl, upload: mocks.storageUpload }),
    },
  }),
}))

import { app } from './app'
import type { AppEnvironment } from './types'

const userId = '11111111-1111-4111-8111-111111111111'
const partnerId = '22222222-2222-4222-8222-222222222222'
const partnershipId = '33333333-3333-4333-8333-333333333333'
const gameId = '44444444-4444-4444-8444-444444444444'
const roundId = '55555555-5555-4555-8555-555555555555'
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-key',
  OPENROUTER_API_KEY: 'openrouter-key',
  OPENROUTER_TEXT_MODEL: 'test/text-model',
}

function game(overrides: Record<string, unknown> = {}) {
  return {
    id: gameId,
    partnershipId,
    status: 'active',
    requestedById: userId,
    acceptedAt: '2026-09-11T11:59:00+00:00',
    currentPlayerId: userId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 0, partner: 0 },
    round: null,
    ...overrides,
  }
}

function round(overrides: Record<string, unknown> = {}) {
  return {
    id: roundId,
    turnNumber: 1,
    explainerId: userId,
    topic: 'Travel',
    status: 'explaining',
    secretWord: 'passport',
    forbiddenWords: ['passport', 'passports'],
    transcript: null,
    transcriptWords: [],
    audioAvailable: false,
    usedForbiddenWord: null,
    guess: null,
    isCorrect: null,
    score: null,
    coachScore: null,
    coachFeedback: null,
    createdAt: '2026-09-11T12:00:00+00:00',
    completedAt: null,
    ...overrides,
  }
}

function jsonRequest(
  path: string,
  method = 'POST',
  body?: unknown,
  bindings: AppEnvironment['Bindings'] = env,
) {
  return app.request(
    path,
    {
      method,
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    bindings,
  )
}

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: userId } }, error: null })
  mocks.rpc.mockReset()
  mocks.storageUpload
    .mockReset()
    .mockResolvedValue({ data: { path: 'recording.wav' }, error: null })
  mocks.createSignedUrl.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('explain-word game API', () => {
  it('lists shared games for the dashboard', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ partnership_id: partnershipId, game_status: 'pending', requested_by: partnerId }],
      error: null,
    })

    const response = await jsonRequest('/api/games/explain-word', 'GET')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [{ partnershipId, status: 'pending', requestedById: partnerId }],
    })
    expect(mocks.rpc).toHaveBeenCalledWith('list_my_word_games')
  })

  it('updates participant presence and exposes the reconnect deadline', async () => {
    mocks.rpc.mockResolvedValue({
      data: game({
        status: 'paused',
        pausedAt: '2026-09-11T12:00:00Z',
        reconnectDeadline: '2026-09-11T12:05:00Z',
        disconnectedPlayerId: partnerId,
        finishedAt: null,
      }),
      error: null,
    })

    const response = await jsonRequest(`/api/games/explain-word/${partnershipId}/presence`, 'POST')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: { status: 'paused', reconnectDeadline: '2026-09-11T12:05:00Z' },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('heartbeat_word_game', {
      p_partnership_id: partnershipId,
    })
  })

  it('marks a participant as having left the game', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/presence`,
      'DELETE',
    )

    expect(response.status).toBe(204)
    expect(mocks.rpc).toHaveBeenCalledWith('leave_word_game', {
      p_partnership_id: partnershipId,
    })
  })

  it('lets either participant end the game immediately', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const response = await jsonRequest(`/api/games/explain-word/${partnershipId}/end`, 'POST')

    expect(response.status).toBe(204)
    expect(mocks.rpc).toHaveBeenCalledWith('end_word_game', {
      p_partnership_id: partnershipId,
    })
  })

  it('lets only the invited partner activate a pending game', async () => {
    const pendingGame = game({ status: 'pending', acceptedAt: null })
    mocks.rpc
      .mockResolvedValueOnce({ data: pendingGame, error: null })
      .mockResolvedValueOnce({ data: game(), error: null })

    const response = await jsonRequest(`/api/games/explain-word/${partnershipId}/accept`, 'POST')

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith('respond_to_word_game', {
      p_accept: true,
      p_game_id: gameId,
    })
  })

  it('creates a generated word without returning provider credentials', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: game(), error: null })
      .mockResolvedValueOnce({ data: game({ round: round() }), error: null })
    const providerFetch = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                word: 'Passport',
                acceptedAnswers: ['passport', 'passports'],
                forbiddenWords: ['passport', 'passports'],
              }),
            },
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', providerFetch)

    const response = await jsonRequest(`/api/games/explain-word/${partnershipId}/rounds`, 'POST', {
      topic: 'Travel',
    })

    expect(response.status).toBe(201)
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_word_game_round', {
      p_game_id: gameId,
      p_topic: 'Travel',
      p_secret_word: 'passport',
      p_accepted_answers: ['passport', 'passports'],
      p_forbidden_words: ['passport', 'passports'],
    })
    const providerRequest = providerFetch.mock.calls[0]!
    expect(providerRequest[0]).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect((providerRequest[1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer openrouter-key',
    })
    expect(await response.text()).not.toContain('openrouter-key')
  })

  it('reports missing AI configuration before generating a word', async () => {
    mocks.rpc.mockResolvedValue({ data: game(), error: null })
    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds`,
      'POST',
      { topic: 'Travel' },
      { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY },
    )
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'ai_not_configured' } })
  })

  it('stores and transcribes browser audio before making it available to the partner', async () => {
    const openRound = round()
    mocks.rpc
      .mockResolvedValueOnce({ data: game({ round: openRound }), error: null })
      .mockResolvedValueOnce({
        data: game({
          round: round({
            status: 'awaiting_guess',
            transcript: 'You need this document to cross a border.',
            transcriptWords: [{ word: 'You', start: 0, end: 0.2 }],
            audioAvailable: true,
            usedForbiddenWord: false,
            coachScore: 91,
            coachFeedback: 'Clear description. Add one more identifying detail.',
          }),
        }),
        error: null,
      })
    const providerFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          text: 'You need this document to cross a border.',
          words: [{ word: 'You', start: 0, end: 0.2 }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  score: 91,
                  feedback: 'Clear description. Add one more identifying detail.',
                }),
              },
            },
          ],
        }),
      )
    vi.stubGlobal('fetch', providerFetch)
    const form = new FormData()
    form.set('audio', new File([new Uint8Array([1, 2, 3])], 'turn.wav', { type: 'audio/wav' }))

    const response = await app.request(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/transcription`,
      { method: 'POST', headers: { Authorization: 'Bearer token' }, body: form },
      env,
    )

    expect(response.status).toBe(200)
    expect(mocks.storageUpload).toHaveBeenCalledWith(`${gameId}/${roundId}.wav`, expect.any(File), {
      contentType: 'audio/wav',
      upsert: true,
    })
    const transcriptionBody = JSON.parse(
      (providerFetch.mock.calls[0]![1] as RequestInit).body as string,
    )
    expect(transcriptionBody).toMatchObject({
      model: 'microsoft/mai-transcribe-2',
      language: 'en',
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('submit_word_game_transcript', {
      p_round_id: roundId,
      p_transcript: 'You need this document to cross a border.',
      p_transcript_words: [{ word: 'You', start: 0, end: 0.2 }],
      p_coach_score: 91,
      p_coach_feedback: 'Clear description. Add one more identifying detail.',
    })
  })

  it('returns a short-lived private recording link to a participant', async () => {
    mocks.rpc.mockResolvedValue({
      data: game({ round: round({ status: 'awaiting_guess', audioAvailable: true }) }),
      error: null,
    })
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.supabase.co/storage/signed/recording' },
      error: null,
    })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/audio`,
      'GET',
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: { url: 'https://example.supabase.co/storage/signed/recording' },
    })
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(`${gameId}/${roundId}.wav`, 300)
  })

  it('rejects unsupported or oversized audio before calling OpenRouter', async () => {
    mocks.rpc.mockResolvedValue({ data: game({ round: round() }), error: null })
    const providerFetch = vi.fn()
    vi.stubGlobal('fetch', providerFetch)
    const form = new FormData()
    form.set('audio', new File(['not audio'], 'turn.txt', { type: 'text/plain' }))
    const response = await app.request(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/transcription`,
      { method: 'POST', headers: { Authorization: 'Bearer token' }, body: form },
      env,
    )
    expect(response.status).toBe(400)
    expect(providerFetch).not.toHaveBeenCalled()
  })
})
