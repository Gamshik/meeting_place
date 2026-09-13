import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCommunity } from '../community/CommunityContext'
import { api } from '../lib/api'
import { games } from '../lib/games'
import { wordGameModeLabel } from '../lib/word-game-mode'

export function NotificationCenter({ onNavigate }: { onNavigate?: () => void }) {
  const { session } = useAuth()
  const { partnerships, sessions, refresh, isLoading, error: loadError } = useCommunity()
  const navigate = useNavigate()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const busy = useRef(false)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const incomingFriends = partnerships.filter(
    (item) => item.status === 'pending' && item.direction === 'incoming',
  )
  const incomingGames = sessions
    .filter((item) => item.status === 'pending' && item.requestedById !== session?.user.id)
    .flatMap((item) => {
      const partnership = partnerships.find(
        (partner) => partner.id === item.partnershipId && partner.status === 'active',
      )
      const game = games.find((game) => game.id === item.gameId)
      return partnership && game ? [{ item, partnership, game }] : []
    })
  const hasOngoingGame = sessions.some(
    (item) => item.status === 'active' || item.status === 'paused',
  )
  const ids = [
    ...incomingFriends.map((item) => item.id),
    ...incomingGames.map(({ item }) => `${item.gameId}:${item.partnershipId}`),
  ]
  const unread = ids.length > 0
  useEffect(() => {
    if (!open) return
    heading.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', keyboard)
    }
  }, [open])
  async function act(id: string, action: () => Promise<unknown>, destination?: string) {
    if (busy.current) return
    busy.current = true
    setPending(id)
    setError(null)
    try {
      await action()
      await refresh()
      if (destination) {
        setOpen(false)
        onNavigate?.()
        navigate(destination)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please try again.')
    } finally {
      busy.current = false
      setPending(null)
    }
  }
  return (
    <div className="notification-anchor" ref={root}>
      <button
        ref={trigger}
        className="icon-button notification-button"
        aria-label={unread ? 'Notifications, pending invitations' : 'Notifications'}
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={() => {
          setOpen((value) => !value)
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 20h4" />
        </svg>
        {unread && <i />}
      </button>
      {open && (
        <section
          className="notifications-panel"
          id="notifications-panel"
          aria-label="Notifications"
        >
          <div className="notification-heading">
            <h2 tabIndex={-1} ref={heading}>
              Notifications
            </h2>
            <button
              className="icon-button"
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              ×
            </button>
          </div>
          <div className="notification-list">
            {isLoading ? (
              <p role="status">Loading notifications…</p>
            ) : !ids.length && !loadError ? (
              <p className="muted">You're all caught up.</p>
            ) : null}
            {error || loadError ? (
              <div role="alert">
                <p>{error ?? loadError}</p>
                <button className="text-action" onClick={() => void refresh()}>
                  Try again
                </button>
              </div>
            ) : null}
            {incomingFriends.map((item) => (
              <article className="notification-item" key={item.id}>
                <p>
                  <strong>{item.partner.displayName}</strong> sent you a friend invitation.
                </p>
                <div className="row-actions">
                  <button
                    className="button button-primary"
                    disabled={pending !== null}
                    onClick={() => void act(item.id, () => api.acceptPartnership(item.id))}
                  >
                    {pending === item.id ? 'Saving…' : 'Accept'}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={pending !== null}
                    onClick={() => void act(item.id, () => api.declinePartnership(item.id))}
                  >
                    Decline
                  </button>
                </div>
              </article>
            ))}
            {incomingGames.map(({ item, partnership, game }) => (
              <article className="notification-item" key={`${game.id}:${item.partnershipId}`}>
                <p>
                  <strong>{partnership.partner.displayName}</strong> invited you to play{' '}
                  {game.title}.
                </p>
                <p className="notification-game-mode">{wordGameModeLabel(item.mode)}</p>
                {hasOngoingGame ? (
                  <p className="notification-restriction">
                    Finish your current game before accepting another invitation.
                  </p>
                ) : null}
                <div className="row-actions">
                  <button
                    className="button button-primary"
                    disabled={pending !== null || hasOngoingGame}
                    onClick={() =>
                      void act(
                        item.partnershipId,
                        () => game.accept(item.partnershipId),
                        `${game.path}/${item.partnershipId}`,
                      )
                    }
                  >
                    {pending === item.partnershipId
                      ? 'Joining…'
                      : hasOngoingGame
                        ? 'Finish current game'
                        : 'Join game'}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={pending !== null}
                    onClick={() =>
                      void act(item.partnershipId, () => game.decline(item.partnershipId))
                    }
                  >
                    Decline
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
