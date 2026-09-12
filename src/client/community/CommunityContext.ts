import { createContext, useContext } from 'react'
import type { Partnership, WordGameHistoryItem, WordGameSummary } from '../../shared/contracts'
export type GameSession = WordGameSummary & { gameId: string }
export type GameHistoryItem = WordGameHistoryItem & { gameId: string }
export type CommunityData = {
  partnerships: Partnership[]
  sessions: GameSession[]
  history: GameHistoryItem[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<boolean>
}
export const CommunityContext = createContext<CommunityData | null>(null)
export function useCommunity() {
  const value = useContext(CommunityContext)
  if (!value) throw new Error('CommunityProvider is required')
  return value
}
