import { useState } from 'react'

import { DemoAudioPlayer } from './DemoAudioPlayer'

export function DemoGuessCard({
  src,
  transcript,
  onGuess,
}: {
  src: string
  transcript: string
  onGuess: (guess: string) => void
}) {
  const [guess, setGuess] = useState('')
  const [audioError, setAudioError] = useState(false)

  return (
    <section className="game-surface guess-card is-recorded" aria-label="Submit your guess">
      <div className="guess-card-content">
        {audioError ? (
          <p role="alert" className="mt-5 text-sm text-red-700">
            The audio is unavailable. Open the transcript to read the clue.
          </p>
        ) : (
          <DemoAudioPlayer
            autoPlay
            src={src}
            label="Partner’s recorded explanation"
            onError={() => setAudioError(true)}
          />
        )}
        <form
          className="guess-card-form"
          data-visual-mode="listening"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            if (guess.trim()) onGuess(guess.trim())
          }}
        >
          <label className="sr-only" htmlFor="demo-word-guess">
            Your answer
          </label>
          <div className="guess-card-controls">
            <input
              id="demo-word-guess"
              name="demo-word-guess"
              type="text"
              className="input guess-card-input"
              autoComplete="off"
              placeholder="Your guess"
              value={guess}
              maxLength={80}
              required
              onChange={(event) => setGuess(event.target.value)}
            />
            <button
              className="button button-primary guess-card-submit"
              type="submit"
              aria-label="Submit guess"
              title="Submit guess"
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path className="guess-submit-arrow" d="M5 16h20m-7-7 7 7-7 7" />
                <path className="guess-submit-spark" d="M8 5v5M5.5 7.5h5" />
              </svg>
              <span className="sr-only">Submit guess</span>
            </button>
          </div>
        </form>
        <details className="guess-transcript">
          <summary>
            <span className="guess-transcript-show">Show transcript</span>
            <span className="guess-transcript-hide">Hide transcript</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="guess-transcript-reveal">
            <div className="guess-transcript-clip">
              <blockquote>{transcript}</blockquote>
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}
