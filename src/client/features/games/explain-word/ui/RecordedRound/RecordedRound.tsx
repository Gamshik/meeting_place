import { useEffect, useRef } from 'react'

import type { WordGame } from '../../../../../../shared/contracts'
import { RECORDED_GUESS_MS } from '../../model/game-constants'
import { parseTimestamp, useServerNow } from '../../lib/game-time'
import { GuessCard } from '../GuessCard/GuessCard'
import { WaitingCard } from '../WaitingCard/WaitingCard'
import { ExplainCard, PhaseNotice, RoundClock } from '../RoundPlayShared/RoundPlayShared'

export function RecordedRound({
  disabled,
  forceStop,
  game,
  onExpire,
  onGuess,
  onRecordingStart,
  onRecordingStop,
  onSkip,
  onSubmit,
  userId,
}: {
  disabled: boolean
  forceStop: boolean
  game: WordGame
  onExpire: () => Promise<boolean>
  onGuess: (guess: string) => Promise<boolean>
  onRecordingStart: () => Promise<boolean>
  onRecordingStop: () => Promise<boolean>
  onSkip: () => Promise<boolean>
  onSubmit: (audio: Blob) => Promise<boolean>
  userId: string
}) {
  const round = game.round!
  const now = useServerNow(game.serverTime, forceStop)
  const expirationAttempted = useRef(false)
  const isExplainer = round.explainerId === userId
  const recordingStartedAt = parseTimestamp(round.recordingStartedAt)
  const recordingFinishedAt = parseTimestamp(round.recordingFinishedAt)
  const explainedAt = parseTimestamp(round.explainedAt)
  const recordingEndsAt = recordingStartedAt + round.explanationDurationSeconds * 1000
  const guessEndsAt = explainedAt + RECORDED_GUESS_MS
  const isGuessing = round.status === 'awaiting_guess'
  const isExpired = isGuessing && explainedAt > 0 && now >= guessEndsAt

  useEffect(() => {
    if (disabled || !isExpired || expirationAttempted.current) return
    expirationAttempted.current = true
    void onExpire().then((succeeded) => {
      if (!succeeded) expirationAttempted.current = false
    })
  }, [disabled, isExpired, onExpire])

  if (round.status === 'explaining') {
    return (
      <div className="recorded-round">
        {!isExplainer && recordingStartedAt > 0 && recordingFinishedAt === 0 ? (
          <RoundClock
            description={
              now < recordingEndsAt
                ? 'Your partner is recording the clue now.'
                : 'The recording is being prepared and sent.'
            }
            remainingMs={recordingEndsAt - now}
            title={now < recordingEndsAt ? 'Recording in progress' : 'Preparing the recording'}
          />
        ) : null}
        {!isExplainer && recordingFinishedAt > 0 ? (
          <PhaseNotice
            description="The clue is being converted, transcribed, and sent to you."
            title="Preparing the recording"
          />
        ) : null}
        {isExplainer ? (
          <ExplainCard
            disabled={disabled}
            forceStop={forceStop}
            game={game}
            onRecordingStart={onRecordingStart}
            onRecordingStop={onRecordingStop}
            onSkip={onSkip}
            onSubmit={onSubmit}
          />
        ) : (
          <WaitingCard
            name={game.partner.displayName}
            message={
              recordingFinishedAt > 0
                ? 'They finished speaking. Their recording is being prepared.'
                : recordingStartedAt > 0
                  ? 'They are recording an explanation.'
                  : 'They are getting ready to record an explanation.'
            }
          />
        )}
      </div>
    )
  }

  const remainingMs = explainedAt > 0 ? guessEndsAt - now : RECORDED_GUESS_MS
  return (
    <div className="recorded-round">
      <RoundClock
        compact
        description={
          isExpired
            ? 'No answer was submitted before the listening window ended.'
            : isExplainer
              ? 'Your partner can replay the clue and submit one answer.'
              : 'Replay the recording as needed, then submit your answer.'
        }
        expired={isExpired}
        remainingMs={remainingMs}
        title={isExpired ? 'Time’s up' : 'Listen and guess'}
      />
      {isExplainer || isExpired ? (
        <WaitingCard
          name={isExpired ? 'the next round' : game.partner.displayName}
          message={
            isExpired
              ? 'No guess was submitted before time ran out.'
              : 'Your explanation is ready. They have up to 90 seconds to answer.'
          }
        />
      ) : (
        <GuessCard
          disabled={disabled}
          audioAvailable={round.audioAvailable}
          liveCall={false}
          visualMode="listening"
          partnershipId={game.partnershipId}
          roundId={round.id}
          transcript={round.transcript ?? ''}
          onGuess={onGuess}
        />
      )}
    </div>
  )
}
