import type { ReactNode } from 'react'

export function WaitingCard({
  compact = false,
  name,
  message,
  title,
}: {
  compact?: boolean
  name: string
  message?: string
  title?: ReactNode
}) {
  if (compact) {
    return (
      <section className="game-surface game-waiting is-compact" aria-live="polite">
        <div className="waiting-compact-copy">
          <span className="waiting-turn-label">{name} is choosing</span>
          <h2>{title ?? `Waiting for ${name}`}</h2>
          {message ? <p>{message}</p> : null}
          <span className="waiting-compact-progress" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <span className="waiting-word-deck" aria-hidden="true">
          <i>?</i>
          <i>?</i>
          <i>?</i>
        </span>
      </section>
    )
  }

  return (
    <section className="game-surface game-waiting" aria-live="polite">
      <div className="waiting-presence" aria-hidden="true">
        <span className="waiting-avatar">{name.trim().charAt(0).toUpperCase()}</span>
        <span className="waiting-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      <h2>{title ?? `Waiting for ${name}`}</h2>
      {message ? <p>{message}</p> : null}
    </section>
  )
}
