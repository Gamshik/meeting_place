import { useState } from 'react'

import { EXPLANATION_PRESETS } from '@features/games/explain-word/model/game-constants'

export function DurationPicker({
  compact = false,
  disabled,
  idPrefix,
  onChange,
  value,
}: {
  compact?: boolean
  disabled: boolean
  idPrefix: string
  onChange: (value: number) => void
  value: number
}) {
  const inputId = `${idPrefix}-explanation-seconds`
  const [draft, setDraft] = useState(String(value))

  const commitDraft = () => {
    const parsed = Number(draft)
    const next = Number.isFinite(parsed) ? Math.min(300, Math.max(30, Math.round(parsed))) : value
    setDraft(String(next))
    onChange(next)
  }

  return (
    <fieldset className={`duration-picker ${compact ? 'is-compact' : ''}`} disabled={disabled}>
      <legend className={compact ? 'sr-only' : undefined}>Explanation time</legend>
      <div className="duration-presets" aria-label="Explanation time presets">
        {EXPLANATION_PRESETS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            className={value === seconds ? 'is-selected' : ''}
            aria-pressed={value === seconds}
            onClick={() => {
              setDraft(String(seconds))
              onChange(seconds)
            }}
          >
            {seconds / 60} min
          </button>
        ))}
      </div>
      <label className="duration-custom" htmlFor={inputId}>
        <span>Custom</span>
        <span>
          <input
            id={inputId}
            type="number"
            min="30"
            max="300"
            step="1"
            inputMode="numeric"
            value={draft}
            onBlur={commitDraft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          sec
        </span>
      </label>
    </fieldset>
  )
}
