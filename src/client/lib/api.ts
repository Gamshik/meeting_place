import type {
  InvitePartnerInput,
  PartnershipCursor,
  PartnershipPage,
  Profile,
  UpdateProfileInput,
} from '../../shared/contracts'
import { supabase } from './supabase'
import { apiErrorBodySchema } from '../../shared/contracts'

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

  if (init?.body) {
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
}
