import type { WordGameMode } from '../../../../../../shared/contracts'
import { wordGameModeLabel } from '../../model/word-game-mode'

export function GameModeBadge({ mode }: { mode: WordGameMode }) {
  return (
    <span className={`game-mode-badge game-mode-${mode}`}>
      <span aria-hidden="true">{mode === 'live_call' ? '↗' : '●'}</span>
      {wordGameModeLabel(mode)}
    </span>
  )
}
