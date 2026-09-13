import type { WordGameHistoryItem, WordGameSummary } from '../../shared/contracts'
import { api } from './api'
export type GameDefinition = {
  id: string
  title: string
  description: string
  path: string
  artwork?: 'word-cards'
  accept: (partnershipId: string) => Promise<unknown>
  decline: (partnershipId: string) => Promise<unknown>
  cancel: (partnershipId: string) => Promise<unknown>
  loadSessions: () => Promise<WordGameSummary[]>
  loadHistory: () => Promise<WordGameHistoryItem[]>
}
export const games: GameDefinition[] = [
  {
    id: 'explain-word',
    title: 'Explain the word',
    description: 'Describe a word without saying it. Your friend guesses, then you switch turns.',
    path: '/games/explain-word',
    artwork: 'word-cards',
    accept: api.acceptWordGame,
    decline: api.declineWordGame,
    cancel: api.cancelWordGame,
    loadSessions: async () => (await api.getWordGames()).data,
    loadHistory: async () => (await api.getWordGameHistory()).data,
  },
]
