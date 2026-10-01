import type { WordGame } from '@contracts/contracts'
import { formatCountdown } from '@features/games/explain-word/lib/game-time'
import { AudioRecorder } from '@features/games/explain-word/ui/AudioRecorder/AudioRecorder'

export function ExplainCard({
  disabled,
  forceStop,
  game,
  onRecordingStart,
  onRecordingStop,
  onSkip,
  onSubmit,
}: {
  disabled: boolean
  forceStop: boolean
  game: WordGame
  onRecordingStart: () => Promise<boolean>
  onRecordingStop: () => Promise<boolean>
  onSkip: () => Promise<unknown>
  onSubmit: (audio: Blob) => Promise<unknown>
}) {
  const round = game.round!
  return (
    <>
      <SecretWordCard disabled={disabled} round={round} onSkip={onSkip} />
      <AudioRecorder
        disabled={disabled}
        forceStop={forceStop}
        durationSeconds={round.explanationDurationSeconds}
        recordingStartedAt={round.recordingStartedAt}
        serverTime={game.serverTime}
        onStart={onRecordingStart}
        onStop={onRecordingStop}
        onSubmit={onSubmit}
      />
    </>
  )
}

export function SecretWordCard({
  disabled,
  onSkip,
  round,
}: {
  disabled: boolean
  onSkip: () => Promise<unknown>
  round: NonNullable<WordGame['round']>
}) {
  return (
    <section className="game-surface secret-surface explain-card live-explain-card">
      <SecretWordBrief round={round} disabled={disabled} onSkip={onSkip} />
    </section>
  )
}

export function RoundClock({
  compact = false,
  description,
  expired = false,
  finalGuess = false,
  preparing = false,
  remainingMs,
  title,
}: {
  compact?: boolean
  description: string
  expired?: boolean
  finalGuess?: boolean
  preparing?: boolean
  remainingMs: number
  title: string
}) {
  const secondsRemaining = Math.max(0, Math.ceil(remainingMs / 1000))
  return (
    <section
      className={`live-round-clock ${compact ? 'is-compact' : ''} ${preparing ? 'is-preparing' : ''} ${finalGuess ? 'is-final-guess' : ''} ${expired ? 'is-expired' : ''}`}
      aria-label={`${title}: ${secondsRemaining} seconds remaining`}
    >
      <div>
        <p>{title}</p>
        <span className="sr-only">{description}</span>
      </div>
      <strong role="timer">{formatCountdown(secondsRemaining)}</strong>
    </section>
  )
}

export function SecretWordBrief({
  round,
  disabled,
  onSkip,
}: {
  round: NonNullable<WordGame['round']>
  disabled: boolean
  onSkip: () => Promise<unknown>
}) {
  const secretWord = round.secretWord?.trim().toLocaleLowerCase()
  const visibleForbiddenWords = round.forbiddenWords?.filter(
    (word) => word.trim().toLocaleLowerCase() !== secretWord,
  )

  return (
    <div className="explain-brief">
      <div className="secret-word-block">
        <div className="secret-word-heading">
          <span>Your secret word</span>
          <button
            type="button"
            className="explain-skip-control"
            aria-label="Skip word"
            disabled={disabled}
            onClick={() => void onSkip()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 5 10 7-10 7ZM19 5v14" />
            </svg>
            Skip
          </button>
        </div>
        <h2>{round.secretWord}</h2>
      </div>
      {visibleForbiddenWords?.length ? (
        <div className="forbidden-words-block">
          <p>Don’t say</p>
          <div>
            {visibleForbiddenWords.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
