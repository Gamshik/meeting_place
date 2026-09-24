import { useRef, useState } from 'react'

import type { WordGame } from '../../../../../../shared/contracts'
import { formatDuration } from '../../lib/game-time'
import { DurationPicker } from '../DurationPicker/DurationPicker'
import { RoomControlIcon } from '../RoomControlIcon/RoomControlIcon'

export function GameTimeSettings({
  disabled,
  game,
  isCreator,
  onSave,
}: {
  disabled: boolean
  game: WordGame
  isCreator: boolean
  onSave: (seconds: number) => Promise<boolean>
}) {
  const [value, setValue] = useState(game.explanationDurationSeconds)
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)

  if (!isCreator) {
    return (
      <div
        className="game-time-readout"
        aria-label={`Explanation time: ${formatDuration(game.explanationDurationSeconds)}`}
        title="The game creator controls this setting"
      >
        <RoomControlIcon icon="timer" />
        <strong>{formatDuration(game.explanationDurationSeconds)}</strong>
      </div>
    )
  }

  return (
    <details className="game-time-settings" ref={details}>
      <summary aria-label="Change explanation time" ref={summary}>
        <RoomControlIcon icon="timer" />
        <strong>{formatDuration(game.explanationDurationSeconds)}</strong>
        <i aria-hidden="true">⌄</i>
      </summary>
      <div className="game-time-settings-popover">
        <div className="game-time-settings-heading">
          <strong className="game-time-settings-title">Explanation time</strong>
          <button
            type="button"
            className="game-time-settings-close"
            aria-label="Close explanation time"
            onClick={() => {
              if (details.current) details.current.open = false
              summary.current?.focus()
            }}
          >
            ×
          </button>
        </div>
        <DurationPicker
          compact
          disabled={disabled}
          idPrefix="active-game"
          value={value}
          onChange={setValue}
        />
        {value !== game.explanationDurationSeconds ? (
          <button
            type="button"
            className="button button-primary"
            disabled={disabled}
            onClick={() => void onSave(value)}
          >
            {disabled ? 'Saving…' : 'Save for next round'}
          </button>
        ) : null}
      </div>
    </details>
  )
}
