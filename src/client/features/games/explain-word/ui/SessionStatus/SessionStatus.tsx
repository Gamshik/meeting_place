import { useEffect, useState } from 'react'

import type { WordGame } from '@contracts/contracts'
import { formatCountdown } from '@features/games/explain-word/lib/game-time'

export function SessionStatus({ game, userId }: { game: WordGame; userId: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (game.status !== 'paused') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [game.status])

  const seconds = game.reconnectDeadline
    ? Math.min(
        300,
        Math.max(0, Math.ceil((new Date(game.reconnectDeadline).getTime() - now) / 1000)),
      )
    : 300
  const partnerLeft = game.disconnectedPlayerId === game.partner.id
  const reconnectingSelf = game.disconnectedPlayerId === userId
  return (
    <section className="session-pause-card" role="status">
      <div className="session-pause-signal" aria-hidden="true">
        <span>{partnerLeft ? game.partner.displayName.trim().charAt(0).toUpperCase() : '↻'}</span>
        <i />
      </div>
      <div className="session-pause-copy">
        <span className="session-pause-status">Game paused</span>
        <h2>
          {reconnectingSelf
            ? 'Reconnecting you'
            : partnerLeft
              ? `Waiting for ${game.partner.displayName}`
              : 'Reconnecting the game'}
        </h2>
      </div>
      <div
        className="session-pause-timer"
        aria-label={`${formatCountdown(seconds)} remaining to reconnect`}
      >
        <span>Time left</span>
        <strong>{formatCountdown(seconds)}</strong>
      </div>
    </section>
  )
}
