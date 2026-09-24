import type { WordGameMode } from '@contracts/contracts'
import { wordGameModeLabel } from '@features/games/explain-word/model/word-game-mode'

export function GameModeBadge({ mode }: { mode: WordGameMode }) {
  return (
    <span className={`game-mode-badge game-mode-${mode}`}>
      <span aria-hidden="true">{mode === 'live_call' ? '↗' : '●'}</span>
      {wordGameModeLabel(mode)}
    </span>
  )
}
