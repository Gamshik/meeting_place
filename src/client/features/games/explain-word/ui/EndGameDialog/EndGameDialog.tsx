import { useEffect, useRef } from 'react'

export function EndGameDialog({
  isBusy,
  onCancel,
  onConfirm,
}: {
  isBusy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    cancelButton.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isBusy, onCancel])

  return (
    <div
      className="game-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onCancel()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-game-title"
        className="game-dialog end-game-dialog"
      >
        <div className="end-game-heading">
          <EndGameArtwork />
          <h2 id="end-game-title">End game?</h2>
        </div>
        <div className="game-dialog-actions">
          <button
            ref={cancelButton}
            type="button"
            className="button button-secondary"
            disabled={isBusy}
            onClick={onCancel}
          >
            Keep playing
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={isBusy}
            onClick={onConfirm}
          >
            {isBusy ? 'Ending…' : 'End game'}
          </button>
        </div>
      </section>
    </div>
  )
}

function EndGameArtwork() {
  return (
    <div className="end-game-artwork" aria-hidden="true">
      <span className="end-game-player is-left">
        <i />
      </span>
      <span className="end-game-link">
        <i />
        <i />
        <i />
      </span>
      <span className="end-game-break">×</span>
      <span className="end-game-player is-right">
        <i />
      </span>
    </div>
  )
}
