/** @jsxImportSource react */
import type { GameDefinition } from '../../model/games'
export function GameCatalog({
  onPlay,
  items,
  selectedId,
}: {
  onPlay: (game: GameDefinition) => void
  items: readonly GameDefinition[]
  selectedId?: string
}) {
  return (
    <div className="game-catalog">
      <div className="game-options" aria-label="Choose a game">
        {items.map((game) => (
          <button
            type="button"
            className="game-choice"
            key={game.id}
            aria-label={game.title}
            aria-pressed={selectedId === game.id}
            onClick={() => onPlay(game)}
          >
            <span className="game-choice-art" aria-hidden="true">
              <svg viewBox="0 0 190 140">
                <path className="game-choice-ray" d="M40 28 24 10m49 12V4m27 31 17-17" />
                <path
                  className="game-choice-bubble game-choice-bubble-back"
                  d="M75 60h69a18 18 0 0 1 18 18v28a18 18 0 0 1-18 18h-13l-1 15-23-15H75a18 18 0 0 1-18-18V78a18 18 0 0 1 18-18Z"
                />
                <path
                  className="game-choice-bubble"
                  d="M22 42h86a19 19 0 0 1 19 19v31a19 19 0 0 1-19 19H67l-28 20 2-20H22A19 19 0 0 1 3 92V61a19 19 0 0 1 19-19Z"
                />
              </svg>
            </span>
            <span className="game-choice-copy">
              <strong>{game.title}</strong>
              <span>{game.description}</span>
            </span>
            <span className="game-choice-state" aria-hidden="true">
              {selectedId === game.id ? '✓' : ''}
            </span>
          </button>
        ))}
        <div className="future-game" aria-label="More games coming soon">
          <svg viewBox="0 0 96 76" aria-hidden="true">
            <path d="M35 17 29 6m19 8V2m13 15 6-11" />
            <path d="M26 26h44c9 0 16 7 16 16v14c0 9-7 16-16 16H26c-9 0-16-7-16-16V42c0-9 7-16 16-16Z" />
            <path d="M29 42v15m-8-7h16m27-4h.1m10 9h.1m-10 9h.1m-10-9h.1" />
          </svg>
          <strong>More games soon</strong>
        </div>
      </div>
    </div>
  )
}

export function WordArtwork() {
  return (
    <div className="word-art" aria-hidden="true">
      <div className="playing-card card-back">
        <span>meeting place</span>
        <div className="card-symbol">↗</div>
      </div>
      <div className="playing-card card-front">
        <span>Explain the word</span>
        <strong>Imagine.</strong>
        <div className="sound-lines">
          {[24, 42, 66, 38, 84, 56, 32, 62, 42].map((height, i) => (
            <i key={i} style={{ height }} />
          ))}
        </div>
        <span>English, together.</span>
      </div>
    </div>
  )
}
