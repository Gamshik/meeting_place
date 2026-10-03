import { GameAiError, runGameAi } from '../lib/game-ai'
import { Hono } from 'hono'

import {
  createWordRoundSchema,
  guessWordRoundSchema,
  reviewWordGuessSchema,
  startWordGameSchema,
  updateWordGameSettingsSchema,
  wordGameActionSchema,
  wordGameHistoryItemSchema,
  wordGameSchema,
  wordGameSummarySchema,
  type WordGame,
} from '../../shared/contracts'
import type { Json } from '../../shared/database.types'
import { errorResponse } from '../lib/responses'
import {
  generatedWordSchema,
  transcriptionSchema,
  generateGameWords,
  OpenRouterError,
  transcribeExplanation,
} from '../lib/openrouter'
import type { AppEnvironment } from '../types'
import { cacheGeneratedCards, WordCardStoreError } from '../lib/word-card-store'

const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const RECORDING_BUCKET = 'word-game-recordings'

export const wordGameRoutes = new Hono<AppEnvironment>()

wordGameRoutes.get('/', async (context) => {
  const { data, error } = await context.get('supabase').rpc('list_my_word_games')
  if (error) return gameDatabaseError(context, error)
  const games = (data ?? []).map((item) => ({
    partnershipId: item.partnership_id,
    mode: item.game_mode,
    status: item.game_status,
    requestedById: item.requested_by,
  }))
  const parsed = wordGameSummarySchema.array().safeParse(games)
  if (!parsed.success) return invalidGameStateResponse(context)
  return context.json({ data: parsed.data })
})

wordGameRoutes.get('/history', async (context) => {
  const { data, error } = await context.get('supabase').rpc('list_my_word_game_history')
  if (error) return gameDatabaseError(context, error)
  const history = (data ?? []).map((item) => ({
    id: item.history_id,
    partnershipId: item.partnership_id,
    mode: item.game_mode,
    finishedAt: item.finished_at,
    partner: {
      id: item.partner_id,
      username: item.partner_username,
      displayName: item.partner_display_name,
      avatarUrl: item.partner_avatar_url,
    },
    scores: {
      you: item.my_score,
      partner: item.partner_score,
    },
    roundCount: item.round_count,
    rounds: item.rounds,
  }))
  const parsed = wordGameHistoryItemSchema.array().safeParse(history)
  if (!parsed.success) return invalidGameStateResponse(context)
  return context.json({ data: parsed.data })
})

wordGameRoutes.get('/:partnershipId', async (context) => {
  const parsed = parsePartnershipId(context.req.param('partnershipId'))
  if (!parsed) return invalidPartnershipResponse(context)
  const { data, error } = await context.get('supabase').rpc('get_word_game', {
    p_partnership_id: parsed,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})

wordGameRoutes.post('/:partnershipId', async (context) => {
  const parsed = parsePartnershipId(context.req.param('partnershipId'))
  const body: unknown = await context.req.json().catch(() => null)
  const request = startWordGameSchema.safeParse(body)
  if (!parsed || !request.success) {
    return errorResponse(context, 400, 'invalid_word_game_mode', 'Choose how you want to play.')
  }
  const { data, error } = await context.get('supabase').rpc('start_word_game', {
    p_partnership_id: parsed,
    p_mode: request.data.mode,
    p_explanation_duration_seconds: request.data.explanationDurationSeconds,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data, 201)
})

wordGameRoutes.patch('/:partnershipId/settings', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const body: unknown = await context.req.json().catch(() => null)
  const request = updateWordGameSettingsSchema.safeParse(body)
  if (!partnershipId || !request.success) {
    return errorResponse(
      context,
      400,
      'invalid_word_game_settings',
      'Choose an explanation time between 30 and 300 seconds.',
    )
  }
  const { data, error } = await context.get('supabase').rpc('update_word_game_settings', {
    p_partnership_id: partnershipId,
    p_explanation_duration_seconds: request.data.explanationDurationSeconds,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})

wordGameRoutes.post('/:partnershipId/accept', (context) => respondToGame(context, true))
wordGameRoutes.post('/:partnershipId/decline', (context) => respondToGame(context, false))

wordGameRoutes.post('/:partnershipId/presence', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  if (!partnershipId) return invalidPartnershipResponse(context)
  const { data, error } = await context.get('supabase').rpc('heartbeat_word_game', {
    p_partnership_id: partnershipId,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})

wordGameRoutes.delete('/:partnershipId/presence', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  if (!partnershipId) return invalidPartnershipResponse(context)
  const { error } = await context.get('supabase').rpc('leave_word_game', {
    p_partnership_id: partnershipId,
  })
  if (error) return gameDatabaseError(context, error)
  return context.body(null, 204)
})

wordGameRoutes.post('/:partnershipId/end', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  if (!partnershipId) return invalidPartnershipResponse(context)
  const { error } = await context.get('supabase').rpc('end_word_game', {
    p_partnership_id: partnershipId,
  })
  if (error) return gameDatabaseError(context, error)
  return context.body(null, 204)
})

wordGameRoutes.delete('/:partnershipId', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  if (!partnershipId) return invalidPartnershipResponse(context)
  const game = await getGame(context, partnershipId)
  if (game instanceof Response) return game
  const { error } = await context.get('supabase').rpc('cancel_word_game', { p_game_id: game.id })
  if (error) return gameDatabaseError(context, error)
  return context.body(null, 204)
})

wordGameRoutes.post('/:partnershipId/rounds', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const body: unknown = await context.req.json().catch(() => null)
  const parsed = createWordRoundSchema.safeParse(body)
  if (!partnershipId || !parsed.success) {
    return errorResponse(context, 400, 'invalid_word_round', 'Choose a valid topic.')
  }

  const supabase = context.get('supabase')
  const { data: gameData, error: gameError } = await supabase.rpc('get_word_game', {
    p_partnership_id: partnershipId,
  })
  if (gameError) return gameDatabaseError(context, gameError)
  const game = parseGame(gameData)
  if (!game) return invalidGameStateResponse(context)
  if (
    game.status !== 'active' ||
    game.currentPlayerId !== context.get('user').id ||
    isOpenRound(game)
  ) {
    return errorResponse(
      context,
      409,
      'word_game_turn_not_available',
      'It is not time for a new word yet.',
    )
  }

  const pooledRound = await createRoundFromPool(supabase, game.id, parsed.data.topic, false)
  if (pooledRound.error) return gameDatabaseError(context, pooledRound.error)
  if (pooledRound.data) return gameResponse(context, pooledRound.data, 201)

  const { data: exclusions, error: exclusionsError } = await supabase.rpc(
    'list_word_game_card_exclusions',
    {
      p_game_id: game.id,
      p_topic: parsed.data.topic,
      p_limit: 200,
    },
  )
  if (exclusionsError) return gameDatabaseError(context, exclusionsError)

  let generationError: unknown = null
  try {
    if (!context.env.WORD_CARD_DATABASE_URL) throw new WordCardStoreError()
    const cards = await runGameAi(
      supabase,
      {
        requesterId: context.get('user').id,
        gameId: game.id,
        roundId: game.round?.id ?? null,
        operation: 'cards',
        fingerprint: parsed.data.topic,
      },
      generatedWordSchema.array().min(1).max(20),
      (signal, usage) =>
        generateGameWords(
          { ...openRouterConfiguration(context.env), usage },
          parsed.data.topic,
          exclusions ?? [],
          signal,
        ),
      context.env.OPENROUTER_API_KEY,
      context.env.AI_USAGE_SIGNING_KEY ?? context.env.OPENROUTER_API_KEY,
    )
    await cacheGeneratedCards(
      context.env.WORD_CARD_DATABASE_URL,
      {
        requesterId: context.get('user').id,
        gameId: game.id,
        topic: parsed.data.topic,
        sourceModel: context.env.OPENROUTER_TEXT_MODEL ?? 'unknown',
        cards: cards as Json,
      },
      context.env.WORD_CARD_DATABASE_CA_CERT,
    )

    const generatedRound = await createRoundFromPool(supabase, game.id, parsed.data.topic, false)
    if (generatedRound.error) return gameDatabaseError(context, generatedRound.error)
    if (generatedRound.data) return gameResponse(context, generatedRound.data, 201)
  } catch (error) {
    if (error instanceof GameAiError && error.kind !== 'credits_exhausted')
      return openRouterErrorResponse(context, error)
    generationError = error
  }

  const fallbackRound = await createRoundFromPool(supabase, game.id, parsed.data.topic, true)
  if (fallbackRound.error) return gameDatabaseError(context, fallbackRound.error)
  if (fallbackRound.data) return gameResponse(context, fallbackRound.data, 201)
  if (generationError) return openRouterErrorResponse(context, generationError)
  return errorResponse(
    context,
    503,
    'word_pool_empty',
    'No suitable word is available for this topic yet. Try again shortly.',
  )
})

wordGameRoutes.post('/:partnershipId/rounds/:roundId/transcription', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const roundId = parseUuid(context.req.param('roundId'))
  if (!partnershipId || !roundId) return invalidPartnershipResponse(context)

  const supabase = context.get('supabase')
  const { data: gameData, error: gameError } = await supabase.rpc('get_word_game', {
    p_partnership_id: partnershipId,
  })
  if (gameError) return gameDatabaseError(context, gameError)
  const game = parseGame(gameData)
  const round = game?.round
  if (
    !game ||
    game.status !== 'active' ||
    game.mode !== 'recorded' ||
    !round ||
    round.id !== roundId ||
    round.status !== 'explaining' ||
    round.explainerId !== context.get('user').id ||
    !round.recordingStartedAt ||
    !round.recordingFinishedAt ||
    !round.secretWord
  ) {
    return errorResponse(
      context,
      409,
      'word_game_round_not_available',
      'This explanation cannot be submitted.',
    )
  }

  const form = await context.req.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return errorResponse(
      context,
      400,
      'invalid_audio',
      'Record an explanation shorter than one minute and under 8 MB.',
    )
  }
  const format = audioFormat(audio)
  if (!format) {
    return errorResponse(context, 400, 'unsupported_audio', 'Use a WAV recording.')
  }

  const audioBuffer = await audio.arrayBuffer()
  const fingerprint = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', audioBuffer)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
  let transcription
  try {
    transcription = await runGameAi(
      supabase,
      {
        requesterId: context.get('user').id,
        gameId: game.id,
        roundId,
        operation: 'transcription',
        fingerprint,
      },
      transcriptionSchema,
      async (signal, usage) => {
        const { error: uploadError } = await supabase.storage
          .from(RECORDING_BUCKET)
          .upload(`${game.id}/${roundId}.wav`, audio, { contentType: 'audio/wav', upsert: true })
        if (uploadError) throw new GameAiError('upload_failed')
        signal.throwIfAborted()
        return transcribeExplanation(
          { ...openRouterConfiguration(context.env), usage },
          toBase64(audioBuffer),
          format,
          signal,
        )
      },
      context.env.OPENROUTER_API_KEY,
      context.env.AI_USAGE_SIGNING_KEY ?? context.env.OPENROUTER_API_KEY,
    )
  } catch (error) {
    return openRouterErrorResponse(context, error)
  }

  const { data, error } = await supabase.rpc('submit_word_game_transcript', {
    p_round_id: roundId,
    p_transcript: transcription.text,
    p_transcript_words: transcription.words as Json,
    p_coach_score: null,
    p_coach_feedback: null,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})

wordGameRoutes.post('/:partnershipId/rounds/:roundId/recording-started', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const roundId = parseUuid(context.req.param('roundId'))
  if (!partnershipId || !roundId) return invalidPartnershipResponse(context)

  const game = await getGame(context, partnershipId)
  if (
    game instanceof Response ||
    game.mode !== 'recorded' ||
    game.round?.id !== roundId ||
    game.round.status !== 'explaining' ||
    game.round.explainerId !== context.get('user').id
  ) {
    if (game instanceof Response) return game
    return errorResponse(
      context,
      409,
      'word_game_round_not_available',
      'This recording cannot be started.',
    )
  }

  const { data, error } = await context.get('supabase').rpc('start_word_game_recording', {
    p_round_id: roundId,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})
wordGameRoutes.post('/:partnershipId/rounds/:roundId/recording-stopped', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const roundId = parseUuid(context.req.param('roundId'))
  if (!partnershipId || !roundId) return invalidPartnershipResponse(context)

  const game = await getGame(context, partnershipId)
  if (
    game instanceof Response ||
    game.mode !== 'recorded' ||
    game.round?.id !== roundId ||
    game.round.status !== 'explaining' ||
    game.round.explainerId !== context.get('user').id ||
    !game.round.recordingStartedAt
  ) {
    if (game instanceof Response) return game
    return errorResponse(
      context,
      409,
      'word_game_round_not_available',
      'This recording cannot be stopped.',
    )
  }

  const { data, error } = await context.get('supabase').rpc('finish_word_game_recording', {
    p_round_id: roundId,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})

wordGameRoutes.post('/:partnershipId/rounds/:roundId/timeout', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const roundId = parseUuid(context.req.param('roundId'))
  if (!partnershipId || !roundId) return invalidPartnershipResponse(context)

  const game = await getGame(context, partnershipId)
  if (game instanceof Response) return game
  const roundStatus = game.round?.status
  if (
    game.round?.id !== roundId ||
    (roundStatus !== 'awaiting_guess' && roundStatus !== 'completed' && roundStatus !== 'skipped')
  ) {
    return errorResponse(
      context,
      409,
      'word_game_round_not_available',
      'This round cannot be ended.',
    )
  }

  const { data, error } = await context.get('supabase').rpc('expire_word_game_round', {
    p_round_id: roundId,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})

wordGameRoutes.get('/:partnershipId/rounds/:roundId/audio', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const roundId = parseUuid(context.req.param('roundId'))
  if (!partnershipId || !roundId) return invalidPartnershipResponse(context)
  const game = await getGame(context, partnershipId)
  if (game instanceof Response) return game
  const round = game.round
  if (
    game.status !== 'active' ||
    !round ||
    round.id !== roundId ||
    !round.audioAvailable ||
    round.status === 'explaining'
  ) {
    return errorResponse(context, 404, 'word_game_audio_not_found', 'No recording is available.')
  }
  const { data, error } = await context
    .get('supabase')
    .storage.from(RECORDING_BUCKET)
    .createSignedUrl(`${game.id}/${roundId}.wav`, 300)
  if (error || !data?.signedUrl) {
    console.error('Word-game recording link failed', { status: error?.statusCode })
    return errorResponse(
      context,
      503,
      'audio_storage_unavailable',
      'The recording is temporarily unavailable.',
    )
  }
  return context.json({ data: { url: data.signedUrl } })
})

wordGameRoutes.post('/:partnershipId/rounds/:roundId/guess', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const roundId = parseUuid(context.req.param('roundId'))
  const body: unknown = await context.req.json().catch(() => null)
  const parsed = guessWordRoundSchema.safeParse(body)
  if (!partnershipId || !roundId || !parsed.success) {
    return errorResponse(context, 400, 'invalid_guess', 'Enter your guess.')
  }
  const { data, error } = await context.get('supabase').rpc('guess_word_game_round', {
    p_round_id: roundId,
    p_guess: parsed.data.guess,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})

wordGameRoutes.post('/:partnershipId/rounds/:roundId/review', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const roundId = parseUuid(context.req.param('roundId'))
  const body: unknown = await context.req.json().catch(() => null)
  const parsed = reviewWordGuessSchema.safeParse(body)
  if (!partnershipId || !roundId || !parsed.success) {
    return errorResponse(
      context,
      400,
      'invalid_guess_review',
      'Choose whether to approve the answer.',
    )
  }
  const { data, error } = await context.get('supabase').rpc('review_word_game_guess', {
    p_round_id: roundId,
    p_approved: parsed.data.approved,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})

wordGameRoutes.post('/:partnershipId/rounds/:roundId/skip', async (context) => {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  const roundId = parseUuid(context.req.param('roundId'))
  if (!partnershipId || !roundId) return invalidPartnershipResponse(context)
  const { data, error } = await context.get('supabase').rpc('skip_word_game_round', {
    p_round_id: roundId,
  })
  if (error) return gameDatabaseError(context, error)
  return gameResponse(context, data)
})

function parsePartnershipId(value: string | undefined) {
  const parsed = wordGameActionSchema.safeParse({ partnershipId: value })
  return parsed.success ? parsed.data.partnershipId : null
}

function parseUuid(value: string) {
  const parsed = wordGameActionSchema.shape.partnershipId.safeParse(value)
  return parsed.success ? parsed.data : null
}

function parseGame(value: unknown) {
  const parsed = wordGameSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

async function getGame(
  context: Parameters<typeof errorResponse>[0],
  partnershipId: string,
): Promise<WordGame | Response> {
  const { data, error } = await context.get('supabase').rpc('get_word_game', {
    p_partnership_id: partnershipId,
  })
  if (error) return gameDatabaseError(context, error)
  return parseGame(data) ?? invalidGameStateResponse(context)
}

async function respondToGame(context: Parameters<typeof errorResponse>[0], accept: boolean) {
  const partnershipId = parsePartnershipId(context.req.param('partnershipId'))
  if (!partnershipId) return invalidPartnershipResponse(context)
  const game = await getGame(context, partnershipId)
  if (game instanceof Response) return game
  const { data, error } = await context.get('supabase').rpc('respond_to_word_game', {
    p_accept: accept,
    p_game_id: game.id,
  })
  if (error) return gameDatabaseError(context, error)
  if (!accept) return context.body(null, 204)
  return gameResponse(context, data)
}

function gameResponse(
  context: Parameters<typeof errorResponse>[0],
  value: unknown,
  status: 200 | 201 = 200,
) {
  const game = parseGame(value)
  if (!game) return invalidGameStateResponse(context)
  return context.json({ data: { ...game, serverTime: new Date().toISOString() } }, status)
}

function isOpenRound(game: WordGame) {
  return game.round?.status === 'explaining' || game.round?.status === 'awaiting_guess'
}

function createRoundFromPool(
  supabase: AppEnvironment['Variables']['supabase'],
  gameId: string,
  topic: string,
  allowSeen: boolean,
) {
  return supabase.rpc('create_word_game_round_from_pool', {
    p_game_id: gameId,
    p_topic: topic,
    p_allow_seen: allowSeen,
  })
}

function invalidPartnershipResponse(context: Parameters<typeof errorResponse>[0]) {
  return errorResponse(context, 400, 'invalid_partnership', 'Invalid partnership identifier.')
}

function invalidGameStateResponse(context: Parameters<typeof errorResponse>[0]) {
  return errorResponse(context, 500, 'word_game_invalid_state', 'The game returned invalid data.')
}

function gameDatabaseError(
  context: Parameters<typeof errorResponse>[0],
  error: { code?: string; message: string },
) {
  const known: Record<string, [404 | 409, string]> = {
    active_partnership_not_found: [404, 'This active partnership was not found.'],
    word_game_not_found: [404, 'No game has been started with this partner.'],
    word_game_invitation_not_available: [409, 'This game request is no longer available.'],
    word_game_player_busy: [409, 'Finish your current game before accepting another request.'],
    word_game_partner_busy: [409, 'Your friend is already playing another game. Try again later.'],
    word_game_turn_not_available: [409, 'It is not your turn.'],
    word_game_round_in_progress: [409, 'Finish the current round first.'],
    word_game_round_not_available: [409, 'This explanation cannot be submitted.'],
    word_game_skip_not_available: [409, 'This word can no longer be skipped.'],
    word_game_live_round_not_available: [409, 'This live round cannot be ended.'],
    word_game_round_not_expired: [409, 'This round still has time remaining.'],
    word_game_guess_not_available: [409, 'This round is not waiting for your guess.'],
    word_game_guess_review_not_available: [409, 'This answer is no longer available for review.'],
    word_game_finished: [409, 'This game has finished.'],
    word_game_end_not_available: [409, 'This game cannot be ended now.'],
    word_game_settings_not_available: [409, 'Only the game creator can change its settings.'],
  }
  if (error.code === 'P0001' && known[error.message]) {
    const [status, message] = known[error.message]!
    return errorResponse(context, status, error.message, message)
  }
  console.error('Word-game database operation failed', { code: error.code })
  return errorResponse(context, 500, 'word_game_operation_failed', 'We could not update the game.')
}

function openRouterErrorResponse(context: Parameters<typeof errorResponse>[0], error: unknown) {
  if (error instanceof OpenRouterError && error.kind === 'rate_limited') {
    if (error.retryAfter !== undefined) context.header('Retry-After', String(error.retryAfter))
    return errorResponse(
      context,
      503,
      'ai_provider_busy',
      'The AI service is busy. Please try again shortly.',
    )
  }
  if (error instanceof GameAiError) {
    if (error.kind === 'credits_exhausted')
      return errorResponse(context, 403, 'credits_exhausted', 'You’ve run out of credits.')
    if (error.retryAfter) context.header('Retry-After', String(error.retryAfter))
    if (error.kind === 'processing')
      return errorResponse(
        context,
        409,
        'ai_processing',
        'This action is already being processed. Wait a moment before trying again.',
      )
    if (error.kind === 'conflict')
      return errorResponse(
        context,
        409,
        'ai_action_conflict',
        'This action has changed or already finished. Refresh the game.',
      )
    if (error.kind === 'upload_failed')
      return errorResponse(
        context,
        503,
        'audio_storage_unavailable',
        'The recording could not be saved. Try again.',
      )
    return errorResponse(
      context,
      503,
      'ai_reservation_unavailable',
      'The game AI is temporarily unavailable. Try again shortly.',
    )
  }
  if (error instanceof WordCardStoreError) {
    return errorResponse(
      context,
      503,
      'word_card_store_unavailable',
      'New words are temporarily unavailable. Try again shortly.',
    )
  }
  if (error instanceof OpenRouterError && error.kind === 'not_configured') {
    return errorResponse(context, 503, 'ai_not_configured', 'The game AI is not configured yet.')
  }
  return errorResponse(
    context,
    502,
    'ai_unavailable',
    'The game AI is temporarily unavailable. Try again.',
  )
}

function openRouterConfiguration(env: AppEnvironment['Bindings']) {
  return {
    apiKey: env.OPENROUTER_API_KEY,
    textModel: env.OPENROUTER_TEXT_MODEL,
    siteUrl: env.OPENROUTER_SITE_URL,
  }
}

function audioFormat(file: File) {
  const mime = file.type.toLowerCase().split(';')[0]
  const formats: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
  }
  return formats[mime ?? '']
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}
