import type { WordGame } from '../../../../../../shared/contracts'

export function RoundOutcome({ round }: { round: NonNullable<WordGame['round']> }) {
  const outcome = round.status === 'skipped' ? 'skipped' : round.isCorrect ? 'success' : 'missed'
  const answer = round.status === 'skipped' ? 'Skipped' : round.guess || 'No answer'
  const label =
    outcome === 'success' ? 'Correct!' : outcome === 'skipped' ? 'Word skipped' : 'Not quite'

  return (
    <section
      className={`round-outcome round-outcome-${outcome}`}
      aria-label={`Round ${round.turnNumber}: ${label}`}
      aria-live="polite"
      role="status"
    >
      <div className="round-outcome-verdict">
        <span className="round-outcome-mark" aria-hidden="true">
          {outcome === 'success' ? '✓' : outcome === 'skipped' ? '↷' : '×'}
        </span>
        <div>
          <small>Round {round.turnNumber}</small>
          <strong>{label}</strong>
        </div>
      </div>
      <div className="round-outcome-words">
        <div>
          <small>Word</small>
          <strong>{round.secretWord}</strong>
        </div>
        <span className="round-outcome-arrow" aria-hidden="true">
          →
        </span>
        <div>
          <small>Answer</small>
          <strong>{answer}</strong>
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
