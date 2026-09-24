import type { WordGameMode } from '@contracts/contracts'
import { ArrowIcon } from '@shared/ui/ArrowIcon/ArrowIcon'
import { wordGameModeLabel } from '@features/games/explain-word/model/word-game-mode'

export function GameModeBadge({ mode }: { mode: WordGameMode }) {
  return (
    <span className={`game-mode-badge game-mode-${mode}`}>
      <span aria-hidden="true">
        {mode === 'live_call' ? <ArrowIcon direction="up-right" /> : '●'}
      </span>
      {wordGameModeLabel(mode)}
    </span>
  )
}
