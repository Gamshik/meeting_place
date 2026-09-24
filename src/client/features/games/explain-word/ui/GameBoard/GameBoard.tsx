import type { WordGame } from '@contracts/contracts'
import { api } from '@shared/api/api'
import { GuessReviewCard } from '@features/games/explain-word/ui/GuessReviewCard/GuessReviewCard'
import { LiveCallRound } from '@features/games/explain-word/ui/LiveCallRound/LiveCallRound'
import { RecordedRound } from '@features/games/explain-word/ui/RecordedRound/RecordedRound'
import { RoundOutcome } from '@features/games/explain-word/ui/RoundOutcome/RoundOutcome'
import { SessionStatus } from '@features/games/explain-word/ui/SessionStatus/SessionStatus'
import { WaitingCard } from '@features/games/explain-word/ui/WaitingCard/WaitingCard'
import { NewRoundCard } from '@features/games/explain-word/ui/TopicPicker/TopicPicker'

export function GameBoard({
  game,
  userId,
  partnershipId,
  isBusy,
  completionPending,
  run,
}: {
  game: WordGame
  userId: string
  partnershipId: string
  isBusy: boolean
  completionPending: boolean
  run: (action: () => Promise<{ data: WordGame } | void>) => Promise<boolean>
}) {
  const round = game.round
  const openRound = round?.status === 'explaining' || round?.status === 'awaiting_guess'
  const needsGuessReview = round?.status === 'awaiting_guess' && round.guess !== null
  const sessionLocked = game.status !== 'active' || completionPending

  return (
    <div className="game-board">
      {sessionLocked && !completionPending ? <SessionStatus game={game} userId={userId} /> : null}
      {game.status !== 'finished' ? (
        <div className="game-play-area">
          {!round || !openRound ? (
            game.currentPlayerId === userId ? (
              <NewRoundCard
                disabled={isBusy || sessionLocked}
                onCreate={(topic) => run(() => api.createWordRound(partnershipId, topic))}
              />
            ) : (
              <WaitingCard compact name={game.partner.displayName} title="Next word incoming" />
            )
          ) : needsGuessReview ? (
            <GuessReviewCard
              disabled={isBusy || sessionLocked}
              game={game}
              userId={userId}
              onReview={(approved) =>
                run(() => api.reviewWordGuess(partnershipId, round.id, approved))
              }
            />
          ) : game.mode === 'live_call' ? (
            <LiveCallRound
              key={round.id}
              disabled={isBusy || sessionLocked}
              frozen={sessionLocked}
              game={game}
              userId={userId}
              onExpire={() => run(() => api.expireWordRound(partnershipId, round.id))}
              onGuess={(guess) => run(() => api.guessWord(partnershipId, round.id, guess))}
              onSkip={() => run(() => api.skipWordRound(partnershipId, round.id))}
            />
          ) : (
            <RecordedRound
              key={round.id}
              disabled={isBusy || sessionLocked}
              forceStop={completionPending}
              frozen={sessionLocked}
              game={game}
              userId={userId}
              onExpire={() => run(() => api.expireWordRound(partnershipId, round.id))}
              onGuess={(guess) => run(() => api.guessWord(partnershipId, round.id, guess))}
              onRecordingStart={() => run(() => api.startWordRecording(partnershipId, round.id))}
              onRecordingStop={() => run(() => api.finishWordRecording(partnershipId, round.id))}
              onSkip={() => run(() => api.skipWordRound(partnershipId, round.id))}
              onSubmit={(audio) =>
                run(() => api.submitWordExplanation(partnershipId, round.id, audio))
              }
            />
          )}
          {round && !openRound ? <RoundOutcome key={round.id} round={round} /> : null}
        </div>
      ) : null}
    </div>
  )
}
