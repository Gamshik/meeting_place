/** @jsxImportSource react */
import type { GameDefinition } from '../lib/games'
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
      <label className="game-select">
        Choose a game
        <select
          className="input"
          value={selectedId ?? items[0]?.id}
          onChange={(event) => {
            const game = items.find((item) => item.id === event.target.value)
            if (game) onPlay(game)
          }}
        >
          {items.map((game) => (
            <option value={game.id} key={game.id}>
              {game.title}
            </option>
          ))}
        </select>
      </label>
      <div className="game-options" aria-label="Choose a game">
        {items.map((game) => (
          <button
            type="button"
            className="game-choice"
            key={game.id}
            aria-pressed={selectedId === game.id}
            onClick={() => onPlay(game)}
          >
            <span>{game.title}</span>
            <span aria-hidden="true">{selectedId === game.id ? '✓' : '→'}</span>
          </button>
        ))}
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
