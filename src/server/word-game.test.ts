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
    mode: 'recorded',
    explanationDurationSeconds: 60,
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
    explanationMethod: null,
    explanationDurationSeconds: 60,
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
      data: [
        {
          partnership_id: partnershipId,
          game_mode: 'live_call',
          game_status: 'pending',
          requested_by: partnerId,
        },
      ],
      error: null,
    })

    const response = await jsonRequest('/api/games/explain-word', 'GET')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [{ partnershipId, mode: 'live_call', status: 'pending', requestedById: partnerId }],
    })
    expect(mocks.rpc).toHaveBeenCalledWith('list_my_word_games')
  })

  it('lists every finished game with its stored rounds', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          history_id: gameId,
          partnership_id: partnershipId,
          game_mode: 'recorded',
          finished_at: '2026-09-11T12:10:00Z',
          partner_id: partnerId,
          partner_username: 'bob',
          partner_display_name: 'Bob',
          partner_avatar_url: null,
          my_score: 1,
          partner_score: 0,
          round_count: 1,
          rounds: [
            {
              id: roundId,
              turnNumber: 1,
              explainerId: userId,
              topic: 'Travel',
              status: 'completed',
              word: 'passport',
              guess: 'passport',
              isCorrect: true,
              score: 1,
              explanationMethod: 'recorded',
              coachScore: 88,
              completedAt: '2026-09-11T12:05:00Z',
            },
          ],
        },
      ],
      error: null,
    })

    const response = await jsonRequest('/api/games/explain-word/history', 'GET')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: [{ id: gameId, roundCount: 1, rounds: [{ word: 'passport', score: 1 }] }],
    })
    expect(mocks.rpc).toHaveBeenCalledWith('list_my_word_game_history')
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

  it('returns a clear conflict when a player accepts while already playing', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: game({ status: 'pending', acceptedAt: null }), error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'word_game_player_busy' },
      })

    const response = await jsonRequest(`/api/games/explain-word/${partnershipId}/accept`, 'POST')

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'word_game_player_busy',
        message: 'Finish your current game before accepting another request.',
      },
    })
  })

  it('does not create a game request when the selected friend is already playing', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'word_game_partner_busy' },
    })

    const response = await jsonRequest(`/api/games/explain-word/${partnershipId}`, 'POST', {
      mode: 'live_call',
      explanationDurationSeconds: 120,
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'word_game_partner_busy',
        message: 'Your friend is already playing another game. Try again later.',
      },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('start_word_game', {
      p_partnership_id: partnershipId,
      p_mode: 'live_call',
      p_explanation_duration_seconds: 120,
    })
  })

  it('lets the creator update the explanation time for future rounds', async () => {
    mocks.rpc.mockResolvedValue({
      data: game({ explanationDurationSeconds: 180 }),
      error: null,
    })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/settings`,
      'PATCH',
      { explanationDurationSeconds: 180 },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: { explanationDurationSeconds: 180 },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('update_word_game_settings', {
      p_partnership_id: partnershipId,
      p_explanation_duration_seconds: 180,
    })
  })

  it('rejects explanation times outside 30 to 300 seconds', async () => {
    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/settings`,
      'PATCH',
      { explanationDurationSeconds: 301 },
    )

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects a missing or unknown game mode before calling the database', async () => {
    const response = await jsonRequest(`/api/games/explain-word/${partnershipId}`, 'POST', {
      mode: 'meeting',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_word_game_mode' },
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('expires a timed round through the atomic timeout operation', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: game({
          mode: 'live_call',
          round: round({ status: 'awaiting_guess', explanationMethod: 'live' }),
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: game({
          mode: 'live_call',
          round: round({
            status: 'completed',
            explanationMethod: 'live',
            isCorrect: false,
            score: 0,
          }),
        }),
        error: null,
      })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/timeout`,
      'POST',
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith('expire_word_game_round', {
      p_round_id: roundId,
    })
    await expect(response.json()).resolves.toMatchObject({
      data: {
        serverTime: expect.any(String),
        round: { status: 'completed', explanationMethod: 'live', score: 0 },
      },
    })
  })

  it('lets the explainer manually approve an inexact answer', async () => {
    const reviewedGame = game({
      currentPlayerId: partnerId,
      scores: { you: 1, partner: 0 },
      round: round({
        status: 'completed',
        guess: 'travel document',
        isCorrect: true,
        score: 1,
        completedAt: '2026-09-11T12:02:00+00:00',
      }),
    })
    mocks.rpc.mockResolvedValueOnce({ data: reviewedGame, error: null })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/review`,
      'POST',
      { approved: true },
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('review_word_game_guess', {
      p_round_id: roundId,
      p_approved: true,
    })
    await expect(response.json()).resolves.toMatchObject({
      data: { round: { guess: 'travel document', isCorrect: true, score: 1 } },
    })
  })

  it('validates a manual answer review before calling the database', async () => {
    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/review`,
      'POST',
      { approved: 'yes' },
    )

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns a skip-specific message when a word can no longer be skipped', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'word_game_skip_not_available' },
    })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/skip`,
      'POST',
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'word_game_skip_not_available',
        message: 'This word can no longer be skipped.',
      },
    })
  })

  it('treats a second timeout request for the completed round as successful', async () => {
    const completedGame = game({
      mode: 'live_call',
      round: round({
        status: 'completed',
        explanationMethod: 'live',
        isCorrect: false,
        score: 0,
      }),
    })
    mocks.rpc
      .mockResolvedValueOnce({ data: completedGame, error: null })
      .mockResolvedValueOnce({ data: completedGame, error: null })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/timeout`,
      'POST',
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith('expire_word_game_round', {
      p_round_id: roundId,
    })
    await expect(response.json()).resolves.toMatchObject({
      data: { round: { status: 'completed', score: 0 } },
    })
  })

  it('does not allow a timeout before a recorded explanation is ready', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: game({ round: round() }), error: null })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/timeout`,
      'POST',
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'word_game_round_not_available' },
    })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('marks the start of a recorded explanation for both players', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: game({ round: round() }), error: null })
      .mockResolvedValueOnce({
        data: game({
          round: round({ recordingStartedAt: '2026-09-11T12:00:10Z' }),
        }),
        error: null,
      })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/recording-started`,
      'POST',
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith('start_word_game_recording', {
      p_round_id: roundId,
    })
    await expect(response.json()).resolves.toMatchObject({
      data: { round: { recordingStartedAt: '2026-09-11T12:00:10Z' } },
    })
  })

  it('marks a recorded explanation as stopped before processing it', async () => {
    const recordingStartedAt = '2026-09-11T12:00:10Z'
    mocks.rpc
      .mockResolvedValueOnce({
        data: game({ round: round({ recordingStartedAt }) }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: game({
          round: round({
            recordingStartedAt,
            recordingFinishedAt: '2026-09-11T12:00:40Z',
          }),
        }),
        error: null,
      })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/recording-stopped`,
      'POST',
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_word_game_recording', {
      p_round_id: roundId,
    })
  })

  it('creates a generated word without returning provider credentials', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: game(), error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: 2, error: null })
      .mockResolvedValueOnce({ data: game({ round: round() }), error: null })
    const providerFetch = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                cards: [
                  {
                    word: 'Passport',
                    acceptedAnswers: ['passport', 'passports'],
                    forbiddenWords: ['passport', 'passports'],
                  },
                  {
                    word: 'Suitcase',
                    acceptedAnswers: ['suitcase', 'suitcases'],
                    forbiddenWords: ['suitcase', 'suitcases'],
                  },
                ],
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
    expect(mocks.rpc).toHaveBeenCalledWith('cache_word_game_cards', {
      p_cards: [
        {
          word: 'passport',
          acceptedAnswers: ['passport', 'passports'],
          forbiddenWords: ['passport', 'passports'],
        },
        {
          word: 'suitcase',
          acceptedAnswers: ['suitcase', 'suitcases'],
          forbiddenWords: ['suitcase', 'suitcases'],
        },
      ],
      p_game_id: gameId,
      p_source_model: 'test/text-model',
      p_topic: 'Travel',
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_word_game_round_from_pool', {
      p_allow_seen: false,
      p_game_id: gameId,
      p_topic: 'Travel',
    })
    const providerRequest = providerFetch.mock.calls[0]!
    expect(providerRequest[0]).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect((providerRequest[1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer openrouter-key',
    })
    expect(JSON.parse((providerRequest[1] as RequestInit).body as string)).toMatchObject({
      temperature: 0.85,
      response_format: { json_schema: { name: 'explain_word_batch' } },
    })
    expect(await response.text()).not.toContain('openrouter-key')
  })

  it('reports missing AI configuration before generating a word', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: game(), error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds`,
      'POST',
      { topic: 'Travel' },
      { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY },
    )
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'ai_not_configured' } })
  })

  it('falls back to a stored card when the AI is unavailable', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: game(), error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: ['passport'], error: null })
      .mockResolvedValueOnce({ data: game({ round: round() }), error: null })

    const response = await jsonRequest(
      `/api/games/explain-word/${partnershipId}/rounds`,
      'POST',
      { topic: 'Travel' },
      { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY },
    )

    expect(response.status).toBe(201)
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_word_game_round_from_pool', {
      p_allow_seen: true,
      p_game_id: gameId,
      p_topic: 'Travel',
    })
  })

  it('uses an unseen pooled card without calling the AI', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: game(), error: null }).mockResolvedValueOnce({
      data: game({ round: round({ secretWord: 'suitcase' }) }),
      error: null,
    })
    const providerFetch = vi.fn()
    vi.stubGlobal('fetch', providerFetch)

    const response = await jsonRequest(`/api/games/explain-word/${partnershipId}/rounds`, 'POST', {
      topic: 'Travel',
    })

    expect(response.status).toBe(201)
    expect(providerFetch).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_word_game_round_from_pool', {
      p_allow_seen: false,
      p_game_id: gameId,
      p_topic: 'Travel',
    })
  })

  it('uses the least-recently-seen card when a generated batch adds no unseen words', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: game(), error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: ['passport'], error: null })
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: game({ round: round({ secretWord: 'passport' }) }),
        error: null,
      })
    const providerFetch = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                cards: [
                  {
                    word: 'Passport',
                    acceptedAnswers: ['passport', 'passports'],
                    forbiddenWords: ['passport', 'passports'],
                  },
                ],
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
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_word_game_round_from_pool', {
      p_allow_seen: true,
      p_game_id: gameId,
      p_topic: 'Travel',
    })
  })

  it('stores and transcribes browser audio before making it available to the partner', async () => {
    const openRound = round({
      recordingStartedAt: '2026-09-11T12:00:10Z',
      recordingFinishedAt: '2026-09-11T12:00:40Z',
    })
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

  it('rejects recording uploads in live-call mode', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: game({ mode: 'live_call', round: round({ explanationMethod: 'live' }) }),
      error: null,
    })
    const form = new FormData()
    form.set('audio', new File([new Uint8Array([1])], 'turn.wav', { type: 'audio/wav' }))

    const response = await app.request(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/transcription`,
      { method: 'POST', headers: { Authorization: 'Bearer token' }, body: form },
      env,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'word_game_round_not_available' },
    })
    expect(mocks.storageUpload).not.toHaveBeenCalled()
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
    mocks.rpc.mockResolvedValue({
      data: game({
        round: round({
          recordingStartedAt: '2026-09-11T12:00:10Z',
          recordingFinishedAt: '2026-09-11T12:00:40Z',
        }),
      }),
      error: null,
    })
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
