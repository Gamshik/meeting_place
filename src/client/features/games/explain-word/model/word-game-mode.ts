import type { WordGameMode } from '@contracts/contracts'

export const WORD_GAME_MODES = [
  {
    value: 'live_call',
    label: 'Live call',
    symbol: '↗',
    description: 'Speak for the chosen time, then give the guesser 30 seconds to decide.',
    previewTitle: 'Your call carries the clue',
    previewDescription: 'Keep Meeting Place open for words, timers, guesses, and scores.',
  },
  {
    value: 'recorded',
    label: 'Recorded',
    symbol: '●',
    description: 'Record a clue, then give your partner 90 seconds to listen and answer.',
    previewTitle: 'Your recording carries the clue',
    previewDescription: 'Your partner listens here before entering a guess.',
  },
] as const satisfies readonly {
  value: WordGameMode
  label: string
  symbol: string
  description: string
  previewTitle: string
  previewDescription: string
}[]

export function wordGameModeLabel(mode: WordGameMode) {
  return WORD_GAME_MODES.find((option) => option.value === mode)!.label
}
