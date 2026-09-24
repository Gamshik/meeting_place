import type {
  InvitePartnerInput,
  PartnershipCursor,
  PartnershipPage,
  Profile,
  ProfileActivity,
  UpdateProfileInput,
  WordGame,
  WordGameHistoryItem,
  WordGameMode,
  WordGameSummary,
} from '../../../shared/contracts'
import { supabase } from './supabase'
import { apiErrorBodySchema } from '../../../shared/contracts'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type DataResponse<T> = { data: T }

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new ApiError('Sign in to continue.', 'authentication_required', 401)
  }

  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${session.access_token}`)

  if (init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, { ...init, headers })

  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(await response.json().catch(() => null))
    const error = parsed.success ? parsed.data.error : undefined
    throw new ApiError(
      error?.message ?? 'Something went wrong.',
      error?.code ?? 'request_failed',
      response.status,
      error?.details,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const api = {
  getProfile: () => apiRequest<DataResponse<Profile>>('/api/me'),
  getProfileActivity: (profileId: string, year: number) =>
    apiRequest<DataResponse<ProfileActivity>>(
      `/api/profiles/${profileId}/activity?${new URLSearchParams({ year: String(year) })}`,
    ),
  updateProfile: (input: UpdateProfileInput) =>
    apiRequest<DataResponse<Profile>>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  getPartnerships: (cursor?: PartnershipCursor) => {
    const query = cursor
      ? `?${new URLSearchParams({ beforeCreatedAt: cursor.createdAt, beforeId: cursor.id })}`
      : ''
    return apiRequest<PartnershipPage>(`/api/partnerships${query}`)
  },
  invitePartner: (input: InvitePartnerInput) =>
    apiRequest<DataResponse<{ partnershipId: string }>>('/api/partnerships/invitations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  acceptPartnership: (partnershipId: string) =>
    apiRequest<DataResponse<{ accepted: boolean }>>(`/api/partnerships/${partnershipId}/accept`, {
      method: 'POST',
    }),
  declinePartnership: (partnershipId: string) =>
    apiRequest<DataResponse<{ accepted: boolean }>>(`/api/partnerships/${partnershipId}/decline`, {
      method: 'POST',
    }),
  endPartnership: (partnershipId: string) =>
    apiRequest<void>(`/api/partnerships/${partnershipId}`, { method: 'DELETE' }),
  getWordGame: (partnershipId: string) =>
    apiRequest<DataResponse<WordGame>>(`/api/games/explain-word/${partnershipId}`),
  getWordGames: () => apiRequest<DataResponse<WordGameSummary[]>>('/api/games/explain-word'),
  getWordGameHistory: () =>
    apiRequest<DataResponse<WordGameHistoryItem[]>>('/api/games/explain-word/history'),
  startWordGame: (partnershipId: string, mode: WordGameMode, explanationDurationSeconds: number) =>
    apiRequest<DataResponse<WordGame>>(`/api/games/explain-word/${partnershipId}`, {
      method: 'POST',
      body: JSON.stringify({ mode, explanationDurationSeconds }),
    }),
  updateWordGameSettings: (partnershipId: string, explanationDurationSeconds: number) =>
    apiRequest<DataResponse<WordGame>>(`/api/games/explain-word/${partnershipId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ explanationDurationSeconds }),
    }),
  acceptWordGame: (partnershipId: string) =>
    apiRequest<DataResponse<WordGame>>(`/api/games/explain-word/${partnershipId}/accept`, {
      method: 'POST',
    }),
  heartbeatWordGame: (partnershipId: string) =>
    apiRequest<DataResponse<WordGame>>(`/api/games/explain-word/${partnershipId}/presence`, {
      method: 'POST',
    }),
  leaveWordGame: (partnershipId: string) =>
    apiRequest<void>(`/api/games/explain-word/${partnershipId}/presence`, {
      method: 'DELETE',
      keepalive: true,
    }),
  endWordGame: (partnershipId: string) =>
    apiRequest<void>(`/api/games/explain-word/${partnershipId}/end`, { method: 'POST' }),
  declineWordGame: (partnershipId: string) =>
    apiRequest<void>(`/api/games/explain-word/${partnershipId}/decline`, { method: 'POST' }),
  cancelWordGame: (partnershipId: string) =>
    apiRequest<void>(`/api/games/explain-word/${partnershipId}`, { method: 'DELETE' }),
  createWordRound: (partnershipId: string, topic: string) =>
    apiRequest<DataResponse<WordGame>>(`/api/games/explain-word/${partnershipId}/rounds`, {
      method: 'POST',
      body: JSON.stringify({ topic }),
    }),
  submitWordExplanation: (partnershipId: string, roundId: string, audio: Blob) => {
    const form = new FormData()
    form.set('audio', audio, `explanation.${audioExtension(audio.type)}`)
    return apiRequest<DataResponse<WordGame>>(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/transcription`,
      { method: 'POST', body: form },
    )
  },
  startWordRecording: (partnershipId: string, roundId: string) =>
    apiRequest<DataResponse<WordGame>>(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/recording-started`,
      { method: 'POST' },
    ),
  finishWordRecording: (partnershipId: string, roundId: string) =>
    apiRequest<DataResponse<WordGame>>(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/recording-stopped`,
      { method: 'POST' },
    ),
  expireWordRound: (partnershipId: string, roundId: string) =>
    apiRequest<DataResponse<WordGame>>(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/timeout`,
      { method: 'POST' },
    ),
  guessWord: (partnershipId: string, roundId: string, guess: string) =>
    apiRequest<DataResponse<WordGame>>(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/guess`,
      { method: 'POST', body: JSON.stringify({ guess }) },
    ),
  reviewWordGuess: (partnershipId: string, roundId: string, approved: boolean) =>
    apiRequest<DataResponse<WordGame>>(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/review`,
      { method: 'POST', body: JSON.stringify({ approved }) },
    ),
  getWordRoundAudio: (partnershipId: string, roundId: string) =>
    apiRequest<DataResponse<{ url: string }>>(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/audio`,
    ),
  skipWordRound: (partnershipId: string, roundId: string) =>
    apiRequest<DataResponse<WordGame>>(
      `/api/games/explain-word/${partnershipId}/rounds/${roundId}/skip`,
      { method: 'POST' },
    ),
}

function audioExtension(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}
