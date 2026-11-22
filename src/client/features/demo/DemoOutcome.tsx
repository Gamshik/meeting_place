export type DemoRoundResult = {
  number: number
  word: string
  guess: string
  outcome: 'success' | 'missed' | 'skipped'
}

export function DemoOutcome({ result }: { result: DemoRoundResult }) {
  const { number, outcome, word, guess } = result
  const label =
    outcome === 'success' ? 'Correct!' : outcome === 'skipped' ? 'Word skipped' : 'Not quite'

  return (
    <section
      className={`round-outcome round-outcome-${outcome}`}
      aria-label={`Round ${number}: ${label}`}
      aria-live="polite"
      role="status"
    >
      <div className="round-outcome-verdict">
        <span className="round-outcome-mark" aria-hidden="true">
          {outcome === 'success' ? '✓' : outcome === 'skipped' ? '↪' : '×'}
        </span>
        <div>
          <small>Round {number}</small>
          <strong>{label}</strong>
        </div>
      </div>
      <div className="round-outcome-words">
        <div>
          <small>Word</small>
          <strong>{word}</strong>
        </div>
        <span className="round-outcome-arrow" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </span>
        <div>
          <small>Answer</small>
          <strong>{outcome === 'skipped' ? 'Skipped' : guess || 'No answer'}</strong>
        </div>
      </div>
      <div className="round-outcome-sparks" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </section>
  )
}
