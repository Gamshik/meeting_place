import { useEffect, useRef } from 'react'

import type { WordGame } from '@contracts/contracts'
import { RECORDED_GUESS_MS } from '@features/games/explain-word/model/game-constants'
import { parseTimestamp, useServerNow } from '@features/games/explain-word/lib/game-time'
import { GuessCard } from '@features/games/explain-word/ui/GuessCard/GuessCard'
import { GuessWaitingStage } from '@features/games/explain-word/ui/GuessWaitingStage/GuessWaitingStage'
import { RecordedWaitingStage } from '@features/games/explain-word/ui/RecordedWaitingStage/RecordedWaitingStage'
import { WaitingCard } from '@features/games/explain-word/ui/WaitingCard/WaitingCard'
import {
  ExplainCard,
  RoundClock,
} from '@features/games/explain-word/ui/RoundPlayShared/RoundPlayShared'

export function RecordedRound({
  disabled,
  forceStop,
  frozen,
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
  frozen: boolean
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
  const now = useServerNow(game.serverTime, frozen)
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
      <div className="recorded-round recorded-clue-stage">
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
          <RecordedWaitingStage
            name={game.partner.displayName}
            state={
              recordingFinishedAt > 0
                ? 'processing'
                : recordingStartedAt > 0
                  ? 'recording'
                  : 'preparing'
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
      {isExpired ? (
        <WaitingCard name="the next round" message="No guess was submitted before time ran out." />
      ) : isExplainer ? (
        <GuessWaitingStage name={game.partner.displayName} frozen={frozen} />
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
