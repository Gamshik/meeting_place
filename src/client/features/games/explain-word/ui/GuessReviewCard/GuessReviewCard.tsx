import type { WordGame } from '@contracts/contracts'

export function GuessReviewCard({
  disabled,
  game,
  onReview,
  userId,
}: {
  disabled: boolean
  game: WordGame
  onReview: (approved: boolean) => Promise<boolean>
  userId: string
}) {
  const round = game.round!
  const isExplainer = round.explainerId === userId

  return (
    <section
      className={`game-surface guess-review-card ${isExplainer ? 'is-explainer' : 'is-guesser'}`}
      aria-live="polite"
    >
      <div className="guess-review-heading">
        <h2>{isExplainer ? 'Does this answer count?' : 'Waiting for answer review'}</h2>
      </div>
      <div className="guess-review-comparison">
        {isExplainer ? (
          <div className="is-secret-word">
            <span>Secret word</span>
            <strong>{round.secretWord}</strong>
          </div>
        ) : null}
        <div className="is-submitted-guess">
          <span>{isExplainer ? `${game.partner.displayName} guessed` : 'Your guess'}</span>
          <strong>{round.guess}</strong>
        </div>
      </div>
      {isExplainer ? (
        <div className="guess-review-actions">
          <button
            className="button button-primary"
            disabled={disabled}
            type="button"
            onClick={() => void onReview(true)}
          >
            {disabled ? 'Saving…' : 'Approve answer'}
          </button>
          <button
            className="button button-secondary"
            disabled={disabled}
            type="button"
            onClick={() => void onReview(false)}
          >
            Keep as incorrect
          </button>
        </div>
      ) : null}
    </section>
  )
}
