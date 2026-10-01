export type RecordedWaitingState = 'preparing' | 'recording' | 'processing'

const stateCopy: Record<RecordedWaitingState, { accessibleLabel: string; status: string }> = {
  preparing: {
    accessibleLabel: 'Getting the clue ready',
    status: 'Ready',
  },
  recording: {
    accessibleLabel: 'Recording now',
    status: 'Rec',
  },
  processing: {
    accessibleLabel: 'Sending the clue',
    status: 'Sending',
  },
}

export function RecordedWaitingStage({
  name,
  state,
}: {
  name: string
  state: RecordedWaitingState
}) {
  const copy = stateCopy[state]
  const initial = name.trim().charAt(0).toLocaleUpperCase()

  return (
    <section
      className={`recorded-waiting-stage is-${state}`}
      aria-live="polite"
      aria-label={`${name}: ${copy.accessibleLabel}`}
    >
      {state === 'preparing' ? <h2>Waiting for {name}</h2> : null}

      {state === 'preparing' ? (
        <svg className="recorded-waiting-pingpong" viewBox="0 0 360 240" aria-hidden="true">
          <g className="waiting-paddle">
            <path
              className="waiting-paddle-edge"
              d="M77 153C77 122 104 106 147 106c35 0 65 12 78 29l68 3v27l-68-1c-15 22-44 36-78 36-42 0-70-19-70-47Z"
            />
            <path className="waiting-paddle-handle" d="m207 130 86 1v23l-86-1Z" />
            <path
              className="waiting-paddle-face"
              d="M77 143c0-31 28-49 70-49s78 20 78 49-36 47-78 47-70-18-70-47Z"
            />
            <path className="waiting-paddle-seam" d="m246 132-1 22" />
            <ellipse className="waiting-ball-shadow" cx="148" cy="143" rx="19" ry="6" />
          </g>
          <g className="waiting-pingpong-ball">
            <circle cx="148" cy="124" r="15" />
            <path d="M140 120a9 9 0 0 1 7-5" />
          </g>
          <g className="waiting-pingpong-impact">
            <path d="m119 133-9-4m65 4 9-4m-35 29v9" />
          </g>
        </svg>
      ) : (
        <div className="recorded-waiting-visual" aria-hidden="true">
          <div className="recorded-waiting-person is-partner">
            <span className="recorded-waiting-avatar">{initial}</span>
            <strong>{name}</strong>
          </div>

          <div className="recorded-waiting-route">
            <span className="recorded-waiting-route-line" />
            <span className="recorded-waiting-packet">
              <i />
              <i />
              <i />
            </span>
            <div className="recorded-waiting-mic">
              <span className="recorded-waiting-mic-icon">
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <rect x="12" y="3" width="8" height="17" rx="4" />
                  <path d="M7 14v3a9 9 0 0 0 18 0v-3M16 26v4M11 30h10" />
                </svg>
              </span>
              <span className="recorded-waiting-state-label">
                <i />
                {copy.status}
              </span>
            </div>
            <span className="recorded-waiting-wave is-left">
              <i />
              <i />
              <i />
            </span>
            <span className="recorded-waiting-wave is-right">
              <i />
              <i />
              <i />
            </span>
          </div>

          <div className="recorded-waiting-person is-you">
            <span className="recorded-waiting-listener">You</span>
            <strong>Listen next</strong>
          </div>
        </div>
      )}
    </section>
  )
}
