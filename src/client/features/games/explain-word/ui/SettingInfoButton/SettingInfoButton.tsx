import { useId } from 'react'

export function SettingInfoButton({ label, text }: { label: string; text: string }) {
  const tooltipId = useId()

  return (
    <span className="setting-info">
      <button
        type="button"
        className="setting-info-button"
        aria-label={label}
        aria-describedby={tooltipId}
      >
        i
      </button>
      <span id={tooltipId} className="setting-info-tooltip" role="tooltip">
        {text}
      </span>
    </span>
  )
}
