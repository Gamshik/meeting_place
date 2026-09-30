import './GuessWaitingStage.css'

export function GuessWaitingStage({ name, frozen }: { name: string; frozen: boolean }) {
  return (
    <section className="guess-waiting-stage" data-frozen={frozen || undefined} aria-live="polite">
      <h2>Waiting for {name}</h2>
      <p className="sr-only">Your explanation is ready. They have up to 90 seconds to answer.</p>
      <svg className="clue-orbit" viewBox="0 0 360 240" aria-hidden="true">
        <ellipse className="clue-orbit-track" cx="180" cy="120" rx="136" ry="76" />
        <g className="clue-orbit-avatar">
          <rect className="clue-orbit-shadow" x="142" y="87" width="84" height="84" rx="17" />
          <rect x="136" y="81" width="84" height="84" rx="17" />
          <text x="178" y="135" textAnchor="middle">
            {name.trim().charAt(0).toLocaleUpperCase()}
          </text>
          <path className="clue-headphones" d="M127 126v-13a51 51 0 0 1 102 0v13" />
          <rect className="clue-earcup" x="121" y="112" width="15" height="30" rx="6" />
          <rect className="clue-earcup" x="220" y="112" width="15" height="30" rx="6" />
        </g>
        <g transform="translate(180 120)">
          <g className="clue-orbit-satellite">
            <rect className="clue-orbit-shadow" x="-20" y="-20" width="48" height="48" rx="9" />
            <rect className="clue-question-tile" x="-24" y="-24" width="48" height="48" rx="9" />
            <path className="clue-question" d="M-7-8c0-10 16-10 16 0 0 7-9 6-9 13M0 13v1" />
          </g>
          <g className="clue-orbit-satellite is-wave">
            <rect className="clue-orbit-shadow" x="-22" y="-17" width="52" height="42" rx="9" />
            <rect className="clue-wave-tile" x="-26" y="-21" width="52" height="42" rx="9" />
            <path className="clue-wave-lines" d="M-16-3v6M-8-9v18M0-13v26M8-7v14M16-3v6" />
          </g>
        </g>
      </svg>
    </section>
  )
}
