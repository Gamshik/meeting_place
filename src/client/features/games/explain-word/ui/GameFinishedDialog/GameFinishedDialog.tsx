import { useEffect, useRef } from 'react'

import type { WordGame } from '@contracts/contracts'

export function GameFinishedDialog({
  game,
  onHome,
  onViewResults,
}: {
  game: WordGame
  onHome: () => void
  onViewResults: () => void
}) {
  const resultsButton = useRef<HTMLButtonElement | null>(null)
  const resultLabel =
    game.scores.you === game.scores.partner
      ? "It's a tie!"
      : game.scores.you > game.scores.partner
        ? 'You won!'
        : `${game.partner.displayName} won`

  useEffect(() => {
    resultsButton.current?.focus()
  }, [])

  return (
    <div className="game-dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="finished-game-title"
        className="game-dialog finished-game-dialog"
      >
        <h2 id="finished-game-title" className="sr-only">
          The game has finished
        </h2>
        <div className="finished-game-celebration" aria-hidden="true">
          <i className="finished-game-confetti is-one" />
          <i className="finished-game-confetti is-two" />
          <i className="finished-game-confetti is-three" />
          <span className="finished-game-trophy">
            <i>★</i>
          </span>
        </div>
        <p className="finished-game-outcome">{resultLabel}</p>
        <div className="finished-game-score" aria-label="Final score">
          <div>
            <span>You</span>
            <strong>{game.scores.you}</strong>
          </div>
          <span aria-hidden="true">:</span>
          <div>
            <span>{game.partner.displayName}</span>
            <strong>{game.scores.partner}</strong>
          </div>
        </div>
        <div className="game-dialog-actions">
          <button type="button" className="button button-secondary" onClick={onHome}>
            Go home
          </button>
          <button
            ref={resultsButton}
            type="button"
            className="button button-primary"
            onClick={onViewResults}
          >
            View results
          </button>
        </div>
      </section>
    </div>
  )
}
