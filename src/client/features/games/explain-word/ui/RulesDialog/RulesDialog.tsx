import { useEffect, useRef } from 'react'
import { ArrowIcon } from '@shared/ui/ArrowIcon/ArrowIcon'

export function RulesDialog({ onClose }: { onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="game-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="game-dialog rules-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-rules-title"
        aria-describedby="game-rules-description"
      >
        <div className="game-dialog-heading">
          <h2 id="game-rules-title">How to play</h2>
          <button
            ref={closeButton}
            type="button"
            className="game-dialog-close"
            aria-label="Close rules"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="rules-dialog-scroll">
          <p id="game-rules-description" className="sr-only">
            Choose a topic, explain the word, let your partner guess, review synonyms, then switch
            roles.
          </p>
          <ol className="rules-steps">
            <li>
              <span className="rules-step-icon" aria-hidden="true">
                <RulesStepIcon step="topic" />
              </span>
              <strong>Choose a topic</strong>
              <RulesStepArrow />
            </li>
            <li>
              <span className="rules-step-icon" aria-hidden="true">
                <RulesStepIcon step="explain" />
              </span>
              <strong>Explain naturally</strong>
              <RulesStepArrow />
            </li>
            <li>
              <span className="rules-step-icon" aria-hidden="true">
                <RulesStepIcon step="guess" />
              </span>
              <strong>Partner guesses</strong>
              <RulesStepArrow />
            </li>
            <li>
              <span className="rules-step-icon" aria-hidden="true">
                <RulesStepIcon step="switch" />
              </span>
              <strong>Switch roles</strong>
            </li>
          </ol>
          <div className="rules-modes">
            <div>
              <span aria-hidden="true">
                <ArrowIcon direction="up-right" />
              </span>
              <strong>Live call</strong>
              <small>Talk together</small>
            </div>
            <div>
              <span aria-hidden="true">●</span>
              <strong>Recorded</strong>
              <small>Reply later</small>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function RulesStepArrow() {
  return (
    <span className="rules-step-arrow" aria-hidden="true">
      <ArrowIcon />
    </span>
  )
}

function RulesStepIcon({ step }: { step: 'topic' | 'explain' | 'guess' | 'switch' }) {
  const paths = {
    topic: (
      <>
        <rect x="5" y="5" width="9" height="9" rx="2" />
        <rect x="18" y="5" width="9" height="9" rx="2" />
        <rect x="5" y="18" width="9" height="9" rx="2" />
        <rect x="18" y="18" width="9" height="9" rx="2" />
        <path d="m20.5 22 2 2 3-4" />
      </>
    ),
    explain: (
      <>
        <path d="M5 7h22v15H16l-6 5v-5H5V7Z" />
        <circle cx="10" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="16" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="22" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
    guess: (
      <>
        <circle cx="10" cy="10" r="5" />
        <path d="M3 27c1-6 3.5-10 7-10s6 4 7 10" />
        <path d="M19 10a5 5 0 1 1 7 4.6c-2 .9-3 2-3 4" />
        <circle cx="23" cy="23" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    switch: (
      <>
        <path d="M5 10h19M19 5l5 5-5 5" />
        <path d="M27 22H8M13 17l-5 5 5 5" />
      </>
    ),
  }

  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2">
      {paths[step]}
    </svg>
  )
}
