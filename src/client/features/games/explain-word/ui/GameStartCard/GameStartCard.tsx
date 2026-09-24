import { useState } from 'react'

import type { WordGameMode } from '@contracts/contracts'
import { DEFAULT_EXPLANATION_SECONDS } from '@features/games/explain-word/model/game-constants'
import { WORD_GAME_MODES } from '@features/games/explain-word/model/word-game-mode'
import { DurationPicker } from '@features/games/explain-word/ui/DurationPicker/DurationPicker'

export function GameStartCard({
  blocked,
  disabled,
  onStart,
}: {
  blocked: boolean
  disabled: boolean
  onStart: (mode: WordGameMode, explanationDurationSeconds: number) => Promise<void>
}) {
  const [mode, setMode] = useState<WordGameMode>('live_call')
  const [explanationDurationSeconds, setExplanationDurationSeconds] = useState(
    DEFAULT_EXPLANATION_SECONDS,
  )
  return (
    <section className="game-lobby game-lobby-ready">
      <div className="game-lobby-copy">
        <fieldset className="game-mode-picker" disabled={disabled || blocked}>
          <legend>Mode</legend>
          {WORD_GAME_MODES.map((option) => (
            <label key={option.value} data-cursor={disabled || blocked ? undefined : 'interactive'}>
              <input
                type="radio"
                name="game-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
              </span>
              <i aria-hidden="true" />
            </label>
          ))}
        </fieldset>
        <DurationPicker
          disabled={disabled || blocked}
          idPrefix="new-game"
          value={explanationDurationSeconds}
          onChange={setExplanationDurationSeconds}
        />
        <div className="game-lobby-actions">
          <button
            type="button"
            className="button button-accent game-lobby-action"
            disabled={disabled || blocked}
            onClick={() => void onStart(mode, explanationDurationSeconds)}
          >
            {disabled ? 'Sending…' : blocked ? 'Finish your current game first' : 'Invite to play'}
          </button>
        </div>
        {blocked ? (
          <p className="game-lobby-blocked" role="status">
            You can have only one active game at a time.
          </p>
        ) : null}
      </div>
    </section>
  )
}
