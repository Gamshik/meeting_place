import { useEffect, useRef, useState } from 'react'

import type { Partnership } from '../../../../../../shared/contracts'
import type { GameHistoryItem } from '../../../../community/model/CommunityContext'
import { games } from '../../../catalog/model/games'
import { wordGameModeLabel } from '../../../explain-word/model/word-game-mode'
import { RoundsTable } from '../../../explain-word/ui/RoundsTable/RoundsTable'

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
  const pageSize = 5
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize))
  const [manualPage, setManualPage] = useState<number | null>(null)
  const highlightedCard = useRef<HTMLElement | null>(null)
  const highlightedIndex = highlightedId
    ? history.findIndex((item) => item.id === highlightedId)
    : -1
  const highlightedPage = highlightedIndex >= 0 ? Math.floor(highlightedIndex / pageSize) + 1 : null
  const currentPage = Math.min(manualPage ?? highlightedPage ?? 1, pageCount)
  const pageStart = (currentPage - 1) * pageSize
  const visibleHistory = history.slice(pageStart, pageStart + pageSize)

  useEffect(() => {
    if (!highlightedCard.current) return
    const frame = requestAnimationFrame(() => {
      highlightedCard.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      highlightedCard.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [currentPage, highlightedId, visibleHistory.length])

  return (
    <section className="history-page">
      <div className="history-tally" aria-label={`${history.length} finished games`}>
        <strong>{String(history.length).padStart(2, '0')}</strong>
        <span>
          <small>Practice archive</small>
          finished games
        </span>
        <i aria-hidden="true">
          <b />
          <b />
          <b />
          <b />
        </i>
      </div>

      {history.length ? (
        <>
          <div className="history-list">
            {visibleHistory.map((item) => {
              const isHighlighted = item.id === highlightedId
              const game = games.find((candidate) => candidate.id === item.gameId)
              const canPlayAgain = friends.some((friend) => friend.id === item.partnershipId)
              const resultState =
                item.scores.you === item.scores.partner
                  ? 'draw'
                  : item.scores.you > item.scores.partner
                    ? 'win'
                    : 'loss'
              const result =
                resultState === 'win' ? 'Win' : resultState === 'loss' ? 'Loss' : 'Draw'
              return (
                <article
                  ref={isHighlighted ? highlightedCard : undefined}
                  className={`history-card is-${resultState}${isHighlighted ? ' is-highlighted' : ''}`}
                  data-highlighted={isHighlighted || undefined}
                  tabIndex={isHighlighted ? -1 : undefined}
                  key={`${item.gameId}:${item.id}`}
                >
                  <div className="history-main">
                    <div className="history-title-row">
                      <div>
                        <p>{game?.title ?? 'English game'}</p>
                        <h2>{item.partner.displayName}</h2>
                      </div>
                      <time dateTime={item.finishedAt}>
                        <span>{formatFinishedDate(item.finishedAt)}</span>
                        <strong>{formatFinishedTime(item.finishedAt)}</strong>
                      </time>
                    </div>
                    <div className="history-meta">
                      <span>{wordGameModeLabel(item.mode)}</span>
                    </div>
                  </div>
                  <div
                    className="history-score"
                    aria-label={`${result}. Score ${item.scores.you} to ${item.scores.partner}`}
                  >
                    <span className="history-outcome">{result}</span>
                    <div aria-hidden="true">
                      <b>
                        <small>You</small>
                        <strong>{item.scores.you}</strong>
                      </b>
                      <i>:</i>
                      <b>
                        <small>Them</small>
                        <strong>{item.scores.partner}</strong>
                      </b>
                    </div>
                  </div>
                  {canPlayAgain ? (
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={disabled}
                      onClick={() => onPlayAgain(item)}
                    >
                      Play again
                    </button>
                  ) : null}
                  <details className="history-rounds" open={isHighlighted || undefined}>
                    <summary>
                      <span>
                        View {item.roundCount} {item.roundCount === 1 ? 'round' : 'rounds'}
                      </span>
                    </summary>
                    <RoundsTable
                      rounds={item.rounds}
                      partnerId={item.partner.id}
                      partnerName={item.partner.displayName}
                    />
                  </details>
                </article>
              )
            })}
          </div>
          {pageCount > 1 ? (
            <HistoryPagination
              page={currentPage}
              pageCount={pageCount}
              firstItem={pageStart + 1}
              lastItem={Math.min(pageStart + pageSize, history.length)}
              totalItems={history.length}
              onChange={setManualPage}
            />
          ) : null}
        </>
      ) : (
        <div className="history-empty">
          <span aria-hidden="true">00</span>
          <h2>Your finished games will live here</h2>
          <p>Complete a game and its score, partner, rounds, and date will be saved.</p>
        </div>
      )}
    </section>
  )
}

function HistoryPagination({
  page,
  pageCount,
  firstItem,
  lastItem,
  totalItems,
  onChange,
}: {
  page: number
  pageCount: number
  firstItem: number
  lastItem: number
  totalItems: number
  onChange: (page: number) => void
}) {
  const visiblePages = Array.from(
    new Set(
      [1, page - 1, page, page + 1, pageCount].filter((item) => item > 0 && item <= pageCount),
    ),
  ).sort((left, right) => left - right)

  return (
    <nav className="history-pagination" aria-label="History pages">
      <div className="history-pagination-status" aria-live="polite">
        <span>
          Showing <strong>{firstItem}</strong>–<strong>{lastItem}</strong> of {totalItems}
        </span>
        <div aria-hidden="true">
          <i style={{ width: `${(lastItem / totalItems) * 100}%` }} />
        </div>
      </div>
      <div className="history-pagination-controls">
        <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>
          <span aria-hidden="true">←</span> Previous
        </button>
        <div className="history-page-numbers">
          {visiblePages.map((pageNumber, index) => (
            <span key={pageNumber}>
              {index > 0 && pageNumber - visiblePages[index - 1]! > 1 ? (
                <i aria-hidden="true">…</i>
              ) : null}
              <button
                type="button"
                aria-label={`Page ${pageNumber}`}
                aria-current={pageNumber === page ? 'page' : undefined}
                onClick={() => onChange(pageNumber)}
              >
                {pageNumber}
              </button>
            </span>
          ))}
        </div>
        <button type="button" disabled={page === pageCount} onClick={() => onChange(page + 1)}>
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
    </nav>
  )
}

function formatFinishedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatFinishedTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
