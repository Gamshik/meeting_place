import { useEffect, useState, type FormEvent } from 'react'

import { api } from '@shared/api/api'
import { messageFromError } from '@shared/lib/errors'
import { AudioPlayer } from '@shared/ui/AudioPlayer/AudioPlayer'

export function GuessCard({
  audioAvailable,
  disabled,
  liveCall,
  partnershipId,
  roundId,
  transcript,
  visualMode,
  onGuess,
}: {
  audioAvailable: boolean
  disabled: boolean
  liveCall: boolean
  partnershipId: string
  roundId: string
  transcript: string
  visualMode: 'listening' | 'recall'
  onGuess: (guess: string) => Promise<unknown>
}) {
  const [guess, setGuess] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)

  useEffect(() => {
    if (!audioAvailable) return
    let active = true
    void api
      .getWordRoundAudio(partnershipId, roundId)
      .then((response) => {
        if (active) setAudioUrl(response.data.url)
      })
      .catch((loadError) => {
        if (active) setAudioError(messageFromError(loadError))
      })
    return () => {
      active = false
    }
  }, [audioAvailable, partnershipId, roundId])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (guess.trim()) void onGuess(guess)
  }
  const guessInputId = `word-guess-${roundId}`

  return (
    <section
      className={`game-surface guess-card ${liveCall ? 'is-live' : 'is-recorded'}`}
      aria-label="Submit your guess"
    >
      <div className={`guess-flow-art is-${visualMode}`} aria-hidden="true">
        {visualMode === 'recall' ? (
          <svg viewBox="0 0 900 270" preserveAspectRatio="xMidYMid meet">
            <path className="guess-flow-loop guess-flow-loop-top" d="M145 72C284 7 619 5 754 72" />
            <path className="guess-flow-moving-arrow is-top is-first" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="0s"
                dur="8s"
                path="M145 72C284 7 619 5 754 72"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path className="guess-flow-moving-arrow is-top is-second" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="-4s"
                dur="8s"
                path="M145 72C284 7 619 5 754 72"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path
              className="guess-flow-loop guess-flow-loop-bottom"
              d="M755 206c-151 63-466 62-610 0"
            />
            <path className="guess-flow-moving-arrow is-bottom is-first" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="0s"
                dur="8s"
                path="M755 206c-151 63-466 62-610 0"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path className="guess-flow-moving-arrow is-bottom is-second" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="-4s"
                dur="8s"
                path="M755 206c-151 63-466 62-610 0"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <g className="guess-flow-person guess-recall-person">
              <rect x="42" y="91" width="88" height="88" rx="20" />
              <circle cx="82" cy="120" r="14" />
              <path d="M58 163c3-18 14-27 24-27 11 0 22 9 25 27" />
              <path className="guess-recall-hand" d="m100 139 10-7" />
            </g>
            <g className="guess-recall-thoughts">
              <circle cx="139" cy="105" r="5" />
              <circle cx="155" cy="88" r="8" />
              <path d="M170 69c0-13 12-23 28-23 7-9 27-9 34 2 17-3 31 7 31 20 0 14-13 24-30 23h-34c-17 1-29-8-29-22Z" />
              <circle cx="196" cy="68" r="3" />
              <circle cx="216" cy="68" r="3" />
              <circle cx="236" cy="68" r="3" />
            </g>
            <g className="guess-recall-clues">
              <rect x="312" y="42" width="20" height="12" rx="4" />
              <rect x="355" y="29" width="28" height="12" rx="4" />
              <rect x="408" y="23" width="17" height="12" rx="4" />
            </g>
            <g className="guess-flow-card guess-flow-card-back">
              <rect x="770" y="96" width="87" height="96" rx="18" />
            </g>
            <g className="guess-flow-card guess-flow-card-front">
              <rect x="755" y="81" width="87" height="96" rx="18" />
              <path d="M784 111c2-16 29-16 29 2 0 13-16 11-16 24M797 153h.01" />
            </g>
            <path className="guess-flow-spark guess-flow-spark-one" d="M850 58v18M841 67h18" />
            <path className="guess-flow-spark guess-flow-spark-two" d="M33 190v14M26 197h14" />
          </svg>
        ) : (
          <svg viewBox="0 0 900 270" preserveAspectRatio="xMidYMid meet">
            <path className="guess-flow-loop guess-flow-loop-top" d="M145 72C284 7 619 5 754 72" />
            <path className="guess-flow-moving-arrow is-top is-first" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="0s"
                dur="8s"
                path="M145 72C284 7 619 5 754 72"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path className="guess-flow-moving-arrow is-top is-second" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="-4s"
                dur="8s"
                path="M145 72C284 7 619 5 754 72"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path
              className="guess-flow-loop guess-flow-loop-bottom"
              d="M755 206c-151 63-466 62-610 0"
            />
            <path className="guess-flow-moving-arrow is-bottom is-first" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="0s"
                dur="8s"
                path="M755 206c-151 63-466 62-610 0"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path className="guess-flow-moving-arrow is-bottom is-second" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="-4s"
                dur="8s"
                path="M755 206c-151 63-466 62-610 0"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <g className="guess-flow-person">
              <rect x="42" y="91" width="88" height="88" rx="20" />
              <circle cx="86" cy="122" r="14" />
              <path d="M61 163c3-18 14-27 25-27s22 9 25 27" />
            </g>
            <g className="guess-flow-waves">
              <path d="M145 117c10 8 10 26 0 34" />
              <path d="M160 107c17 13 17 41 0 54" />
              <path d="M177 97c24 20 24 57 0 76" />
            </g>
            <g className="guess-flow-card guess-flow-card-back">
              <rect x="770" y="96" width="87" height="96" rx="18" />
            </g>
            <g className="guess-flow-card guess-flow-card-front">
              <rect x="755" y="81" width="87" height="96" rx="18" />
              <path d="M784 111c2-16 29-16 29 2 0 13-16 11-16 24M797 153h.01" />
            </g>
            <path className="guess-flow-spark guess-flow-spark-one" d="M850 58v18M841 67h18" />
            <path className="guess-flow-spark guess-flow-spark-two" d="M33 190v14M26 197h14" />
          </svg>
        )}
      </div>
      <div className="guess-card-content">
        {!liveCall && audioUrl ? (
          <div className="mt-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="mb-2 text-sm font-medium text-stone-700">Listen to their explanation</p>
            <AudioPlayer src={audioUrl} label="Partner’s recorded explanation" />
          </div>
        ) : !liveCall && audioAvailable && !audioError ? (
          <p role="status" className="mt-5 text-sm text-stone-500">
            Loading the recording…
          </p>
        ) : null}
        {audioError ? (
          <p role="alert" className="mt-5 text-sm text-red-700">
            {audioError}
          </p>
        ) : null}
        {!liveCall ? (
          <blockquote className="mt-6 rounded-2xl bg-stone-100 p-5 leading-7 text-stone-700">
            “{transcript}”
          </blockquote>
        ) : null}
        <form
          className="guess-card-form"
          autoComplete="off"
          data-visual-mode={visualMode}
          onSubmit={submit}
        >
          <label className="sr-only" htmlFor={guessInputId}>
            Your answer
          </label>
          <div className="guess-mobile-cue" aria-hidden="true">
            <span className="guess-mobile-person">
              <svg viewBox="0 0 32 32">
                <circle cx="16" cy="11" r="5" />
                <path d="M7 27c1-7 5-10 9-10s8 3 9 10" />
              </svg>
            </span>
            <span className="guess-mobile-clues">
              <i />
              <i />
              <i />
            </span>
            <span className="guess-mobile-word">?</span>
          </div>
          <div className="guess-card-controls">
            <input
              id={guessInputId}
              name={guessInputId}
              type="text"
              className="input guess-card-input"
              autoComplete="off"
              placeholder="Type your answer"
              value={guess}
              maxLength={80}
              required
              disabled={disabled}
              onChange={(event) => setGuess(event.target.value)}
            />
            <button
              className="button button-primary guess-card-submit"
              disabled={disabled}
              type="submit"
              aria-label={disabled ? 'Checking answer' : 'Submit guess'}
              title={disabled ? 'Checking answer…' : 'Submit guess'}
              data-busy={disabled ? 'true' : undefined}
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path className="guess-submit-arrow" d="M5 16h20m-7-7 7 7-7 7" />
                <path className="guess-submit-spark" d="M8 5v5M5.5 7.5h5" />
              </svg>
              <span className="sr-only">{disabled ? 'Checking answer' : 'Submit guess'}</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
