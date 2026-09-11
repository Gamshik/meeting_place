import type {
  ApiErrorBody,
  InvitePartnerInput,
  Partnership,
  Profile,
  UpdateProfileInput,
} from '../../shared/contracts'
import { supabase } from './supabase'

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
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null
    throw new ApiError(
      body?.error.message ?? 'Something went wrong.',
      body?.error.code ?? 'request_failed',
      response.status,
      body?.error.details,
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
  getPartnerships: () => apiRequest<DataResponse<Partnership[]>>('/api/partnerships'),
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
