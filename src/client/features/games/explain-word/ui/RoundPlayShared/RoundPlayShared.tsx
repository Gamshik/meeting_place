import type { WordGame } from '../../../../../../shared/contracts'
import { formatCountdown } from '../../lib/game-time'
import { AudioRecorder } from '../AudioRecorder/AudioRecorder'

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
    <section className="game-surface secret-surface explain-card">
      <div className="explain-card-topbar">
        <button
          type="button"
          className="explain-skip-control"
          disabled={disabled}
          onClick={() => void onSkip()}
        >
          Skip word
        </button>
      </div>
      <SecretWordBrief round={round} />
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

export function PhaseNotice({ description, title }: { description: string; title: string }) {
  return (
    <section className="live-round-clock phase-notice" role="status">
      <div>
        <p>{title}</p>
        <span>{description}</span>
      </div>
      <strong aria-hidden="true">•••</strong>
    </section>
  )
}

export function SecretWordBrief({ round }: { round: NonNullable<WordGame['round']> }) {
  const secretWord = round.secretWord?.trim().toLocaleLowerCase()
  const visibleForbiddenWords = round.forbiddenWords?.filter(
    (word) => word.trim().toLocaleLowerCase() !== secretWord,
  )

  return (
    <div className="explain-brief">
      <div className="secret-word-block">
        <span>Your secret word</span>
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
