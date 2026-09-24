import { useEffect, useRef, useState } from 'react'

import type { Partnership, WordGameRoundSummary } from '@contracts/contracts'
import type { GameHistoryItem } from '@features/community/model/CommunityContext'
import { games } from '@features/games/catalog/model/games'

export function HistoryView({
  history,
  friends,
  highlightedId,
  disabled,
  onPlayAgain,
}: {
  history: GameHistoryItem[]
  friends: Partnership[]
  highlightedId: string | null
  disabled: boolean
  onPlayAgain: (item: GameHistoryItem) => void
}) {
  const pageSize = 6
  const [navigation, setNavigation] = useState<{
    highlight: string | null
    page: number
    selected: string | null
  } | null>(null)
  const resultPanel = useRef<HTMLElement>(null)
  const highlightedIndex = history.findIndex((item) => item.id === highlightedId)
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize))
  const manual = navigation?.highlight === highlightedId ? navigation : null
  const page = Math.min(
    manual?.page ?? (highlightedIndex >= 0 ? Math.floor(highlightedIndex / pageSize) + 1 : 1),
    pageCount,
  )
  const visibleHistory = history.slice((page - 1) * pageSize, page * pageSize)
  const selected =
    visibleHistory.find((item) => item.id === (manual ? manual.selected : highlightedId)) ??
    visibleHistory[0]

  useEffect(() => {
    if (!highlightedId || selected?.id !== highlightedId) return
    const frame = requestAnimationFrame(() => {
      resultPanel.current?.focus({ preventScroll: true })
      resultPanel.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [highlightedId, selected?.id])

  return (
    <section className="archive-page" aria-label="Game history">
      <div className="archive-count" aria-label={`${history.length} finished games`}>
        <div className="archive-count-number">
          <strong>{history.length}</strong>
          <span className="archive-count-orbit" aria-hidden="true">
            <i />
            <b />
          </span>
        </div>
        <span>{history.length === 1 ? 'game' : 'games'}</span>
      </div>
      {selected ? (
        <div className="archive-layout">
          <div className="archive-browser">
            <div className="archive-matches" aria-label="Finished games">
              {visibleHistory.map((item) => {
                const game = games.find((candidate) => candidate.id === item.gameId)
                const outcome =
                  item.scores.you === item.scores.partner
                    ? 'draw'
                    : item.scores.you > item.scores.partner
                      ? 'win'
                      : 'loss'
                return (
                  <button
                    key={`${item.gameId}:${item.id}`}
                    type="button"
                    className="archive-match"
                    aria-pressed={selected.id === item.id}
                    aria-controls="archive-results"
                    aria-label={`${game?.title ?? 'English game'} with ${item.partner.displayName}, ${formatDate(item.finishedAt)}, ${outcome}, you ${item.scores.you}, partner ${item.scores.partner}`}
                    onClick={() =>
                      setNavigation({ highlight: highlightedId, page, selected: item.id })
                    }
                  >
                    <svg className="archive-game-icon" viewBox="0 0 48 48" aria-hidden="true">
                      <path
                        fill="var(--mp-lilac)"
                        d="M24 17h14a6 6 0 0 1 6 6v9a6 6 0 0 1-6 6v7l-9-7h-5a6 6 0 0 1-6-6v-9a6 6 0 0 1 6-6Z"
                      />
                      <path
                        fill="var(--mp-acid)"
                        d="M9 4h19a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6h-9L9 37v-9a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6Z"
                      />
                    </svg>
                    <span className="archive-partner">
                      <strong>{item.partner.displayName}</strong>
                      <time dateTime={item.finishedAt}>{formatDate(item.finishedAt)}</time>
                    </span>
                    <span className={`archive-outcome is-${outcome}`}>{outcome}</span>
                    <span className="archive-score" aria-hidden="true">
                      {item.scores.you} − {item.scores.partner}
                    </span>
                  </button>
                )
              })}
            </div>
            {pageCount > 1 && (
              <nav className="archive-pagination" aria-label="History pages">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() =>
                    setNavigation({ highlight: highlightedId, page: page - 1, selected: null })
                  }
                >
                  Previous
                </button>
                <span aria-live="polite">
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page === pageCount}
                  onClick={() =>
                    setNavigation({ highlight: highlightedId, page: page + 1, selected: null })
                  }
                >
                  Next
                </button>
              </nav>
            )}
          </div>
          <section
            id="archive-results"
            className="archive-results"
            ref={resultPanel}
            tabIndex={-1}
            aria-labelledby="archive-result-title"
            data-game-id={selected.id}
          >
            <header className="archive-result-header">
              <h2 id="archive-result-title">
                You {selected.scores.you} − {selected.scores.partner} {selected.partner.displayName}
              </h2>
              {friends.some((friend) => friend.id === selected.partnershipId) && (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={disabled}
                  onClick={() => onPlayAgain(selected)}
                >
                  Play again
                </button>
              )}
            </header>
            {selected.rounds.length ? (
              <div
                key={selected.id}
                className="archive-rounds-scroll"
                role="region"
                aria-label="Scrollable round results"
                tabIndex={0}
              >
                <table className="archive-rounds">
                  <caption className="sr-only">
                    Round results with {selected.partner.displayName}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Word</th>
                      <th scope="col">Answer</th>
                      <th scope="col">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.rounds.map((round) => (
                      <tr key={round.id}>
                        <th scope="row">
                          {round.turnNumber}. {round.word ?? 'Hidden'}
                        </th>
                        <td>{round.guess ?? '—'}</td>
                        <td>
                          <HistoryRoundResult
                            round={round}
                            partnerId={selected.partner.id}
                            partnerName={selected.partner.displayName}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="archive-no-rounds">No rounds were played.</p>
            )}
          </section>
        </div>
      ) : (
        <div className="archive-empty">
          <h2>Your finished games will live here</h2>
          <p>Complete a game to see its score and answers.</p>
        </div>
      )}
    </section>
  )
}

function HistoryRoundResult({
  round,
  partnerId,
  partnerName,
}: {
  round: WordGameRoundSummary
  partnerId: string
  partnerName: string
}) {
  if (round.status === 'skipped') return <span className="archive-result-paused">Skipped</span>
  if (round.status !== 'completed') return <span className="archive-result-paused">Unfinished</span>
  if (round.score === 1)
    return (
      <span className="archive-result-earned">
        {round.explainerId === partnerId ? partnerName : 'You'} +1
      </span>
    )
  if (round.isCorrect === false && round.guess)
    return <span className="archive-incorrect">Incorrect</span>
  return <span className="archive-result-neutral">{round.guess ? 'No point' : 'No answer'}</span>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
