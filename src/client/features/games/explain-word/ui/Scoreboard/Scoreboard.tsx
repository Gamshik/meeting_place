import type { WordGame } from '../../../../../../shared/contracts'

export function Scoreboard({ game }: { game: WordGame }) {
  return (
    <div className="game-scoreboard" aria-label="Score" aria-live="polite">
      <div className="is-you">
        <p>You</p>
        <strong key={`you-${game.scores.you}`}>{game.scores.you}</strong>
      </div>
      <span aria-hidden="true">:</span>
      <div className="is-partner">
        <p>{game.partner.displayName}</p>
        <strong key={`partner-${game.scores.partner}`}>{game.scores.partner}</strong>
      </div>
    </div>
  )
}
