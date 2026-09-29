import { EXPLANATION_PRESETS } from '@features/games/explain-word/model/game-constants'
import { SettingInfoButton } from '@features/games/explain-word/ui/SettingInfoButton/SettingInfoButton'

export function DurationPicker({
  compact = false,
  disabled,
  onChange,
  value,
}: {
  compact?: boolean
  disabled: boolean
  onChange: (value: number) => void
  value: number
}) {
  return (
    <fieldset className={`duration-picker ${compact ? 'is-compact' : ''}`} disabled={disabled}>
      <legend className={compact ? 'sr-only' : undefined}>
        <span className="setting-legend-content">
          <span>Explanation time</span>
          {!compact ? (
            <SettingInfoButton label="About explanation time" text="Time to explain each word." />
          ) : null}
        </span>
      </legend>
      <div className="duration-presets" aria-label="Explanation time presets">
        {EXPLANATION_PRESETS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            className={value === seconds ? 'is-selected' : ''}
            aria-pressed={value === seconds}
            onClick={() => onChange(seconds)}
          >
            {seconds / 60} min
          </button>
        ))}
      </div>
    </fieldset>
  )
}
