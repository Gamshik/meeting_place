import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { demoHomeState } from './demo-navigation'
import { DemoEndDialog } from './DemoEndDialog'
import { DemoRoomIcon } from './DemoRoomIcon'
import { DemoRules } from './DemoRules'
import { DemoSettingInfo } from './DemoSettingInfo'

const explanationPresets = [60, 120, 180, 240, 300]

export function DemoDurationPicker({
  value,
  onChange,
  compact = false,
}: {
  value: number
  onChange: (seconds: number) => void
  compact?: boolean
}) {
  return (
    <fieldset className={`duration-picker${compact ? ' is-compact' : ''}`}>
      <legend className={compact ? 'sr-only' : undefined}>
        <span className="setting-legend-content">
          <span>Explanation time</span>
          {!compact ? (
            <DemoSettingInfo label="About explanation time" text="Time to explain each word." />
          ) : null}
        </span>
      </legend>
      <div className="duration-presets" aria-label="Explanation time presets">
        {explanationPresets.map((seconds) => (
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

export function DemoRoomHeader({
  score,
  duration,
  onDurationChange,
}: {
  score?: { you: number; partner: number }
  duration?: number
  onDurationChange?: (seconds: number) => void
}) {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'rules' | 'end' | null>(null)
  const inRoom = score !== undefined

  return (
    <>
      <header className={`game-page-header${inRoom ? ' is-active is-room' : ''}`}>
        <div className="game-page-heading">
          <Link
            className="game-back-link"
            to="/"
            state={demoHomeState}
            aria-label="Lobby"
            title="Return to lobby"
          >
            <DemoRoomIcon icon="leave" />
          </Link>
          {inRoom ? (
            <h1 className="sr-only">Explain the word</h1>
          ) : (
            <div className="game-title-row">
              <div>
                <h1>Explain the word</h1>
              </div>
            </div>
          )}
        </div>
        <div className="game-header-tools">
          {score ? (
            <div className="game-scoreboard score-broadcast" aria-label="Score" aria-live="polite">
              <div className="is-you">
                <p>You</p>
                <strong key={score.you}>{score.you}</strong>
              </div>
              <span aria-hidden="true">:</span>
              <div className="is-partner">
                <p>Demo partner</p>
                <strong key={score.partner}>{score.partner}</strong>
              </div>
            </div>
          ) : null}
          {duration && onDurationChange ? (
            <DemoTimeSettings key={duration} duration={duration} onChange={onDurationChange} />
          ) : null}
          <button
            type="button"
            className="game-icon-button"
            aria-label="How to play"
            title="How to play"
            onClick={() => setDialog('rules')}
          >
            i
          </button>
          {inRoom ? (
            <button
              type="button"
              className="game-end-control"
              aria-label="End game"
              title="End game"
              onClick={() => setDialog('end')}
            >
              <DemoRoomIcon icon="finish" />
            </button>
          ) : null}
        </div>
      </header>
      {dialog === 'rules' ? <DemoRules onClose={() => setDialog(null)} /> : null}
      {dialog === 'end' ? (
        <DemoEndDialog
          onCancel={() => setDialog(null)}
          onConfirm={() => navigate('/', { state: demoHomeState })}
        />
      ) : null}
    </>
  )
}

function DemoTimeSettings({
  duration,
  onChange,
}: {
  duration: number
  onChange: (seconds: number) => void
}) {
  const [value, setValue] = useState(duration)
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)

  function close() {
    if (details.current) details.current.open = false
    summary.current?.focus()
  }

  return (
    <details className="game-time-settings" ref={details}>
      <summary aria-label="Change explanation time" ref={summary}>
        <DemoRoomIcon icon="timer" />
        <strong>{duration / 60} min</strong>
        <i aria-hidden="true">⌄</i>
      </summary>
      <div className="game-time-settings-popover">
        <div className="game-time-settings-heading">
          <div className="game-time-settings-title-row">
            <strong className="game-time-settings-title">Explanation time</strong>
            <DemoSettingInfo label="About explanation time" text="Time to explain each word." />
          </div>
          <button
            type="button"
            className="game-time-settings-close"
            aria-label="Close explanation time"
            onClick={close}
          >
            ×
          </button>
        </div>
        <DemoDurationPicker compact value={value} onChange={setValue} />
        {value !== duration ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              close()
              onChange(value)
            }}
          >
            Save for next round
          </button>
        ) : null}
      </div>
    </details>
  )
}
