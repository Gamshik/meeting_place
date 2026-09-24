import { useEffect, useRef } from 'react'

import type { WordGame } from '../../../../../../shared/contracts'
import { LIVE_FINAL_GUESS_MS, LIVE_PREPARATION_MS } from '../../model/game-constants'
import { useServerNow } from '../../lib/game-time'
import { GuessCard } from '../GuessCard/GuessCard'
import { RoundClock, SecretWordBrief } from '../RoundPlayShared/RoundPlayShared'

export function LiveCallRound({
  disabled,
  frozen,
  game,
  onExpire,
  onGuess,
  onSkip,
  userId,
}: {
  disabled: boolean
  frozen: boolean
  game: WordGame
  onExpire: () => Promise<boolean>
  onGuess: (guess: string) => Promise<boolean>
  onSkip: () => Promise<boolean>
  userId: string
}) {
  const round = game.round!
  const preparationEndsAt = Date.parse(round.createdAt) + LIVE_PREPARATION_MS
  const explanationEndsAt = preparationEndsAt + round.explanationDurationSeconds * 1000
  const roundEndsAt = explanationEndsAt + LIVE_FINAL_GUESS_MS
  const now = useServerNow(game.serverTime, frozen)
  const expirationAttempted = useRef(false)
  const isPreparing = now < preparationEndsAt
  const isExplaining = !isPreparing && now < explanationEndsAt
  const isExpired = now >= roundEndsAt
  const targetTime = isPreparing
    ? preparationEndsAt
    : isExplaining
      ? explanationEndsAt
      : roundEndsAt
  const isExplainer = round.explainerId === userId

  useEffect(() => {
    if (disabled || !isExpired || expirationAttempted.current) return
    expirationAttempted.current = true
    void onExpire().then((succeeded) => {
      if (!succeeded) expirationAttempted.current = false
    })
  }, [disabled, isExpired, onExpire])

  return (
    <div className="live-round">
      <RoundClock
        description={
          isPreparing
            ? 'Both players get five seconds to get ready.'
            : isExplaining
              ? 'Speak in your call while your partner can type the answer.'
              : isExpired
                ? 'Ending this round…'
                : 'The clue is over. The guesser gets 30 seconds to think.'
        }
        expired={isExpired}
        finalGuess={!isPreparing && !isExplaining && !isExpired}
        preparing={isPreparing}
        remainingMs={targetTime - now}
        title={
          isPreparing
            ? 'Get ready'
            : isExplaining
              ? isExplainer
                ? 'Explain now'
                : 'Guess now'
              : isExpired
                ? 'Time’s up'
                : 'Final guess'
        }
      />

      {isExplainer ? (
        <section className="game-surface secret-surface explain-card live-explain-card">
          <div className="explain-card-topbar">
            <button
              type="button"
              className="explain-skip-control"
              disabled={disabled || isExpired}
              onClick={() => void onSkip()}
            >
              Skip word
            </button>
          </div>
          <SecretWordBrief round={round} />
        </section>
      ) : isPreparing ? (
        <section
          className="live-ready-cue"
          role="status"
          aria-label={`Get ready to listen to ${game.partner.displayName}’s clue`}
        >
          <div className="live-ready-person is-partner" aria-hidden="true">
            <span>{game.partner.displayName.trim().charAt(0).toLocaleUpperCase()}</span>
            <strong>{game.partner.displayName}</strong>
          </div>
          <div className="live-ready-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="live-ready-person is-you" aria-hidden="true">
            <span>You</span>
            <strong>Listen</strong>
          </div>
        </section>
      ) : (
        <GuessCard
          disabled={disabled || isExpired}
          audioAvailable={false}
          liveCall
          visualMode={isExplaining ? 'listening' : 'recall'}
          partnershipId={game.partnershipId}
          roundId={round.id}
          transcript=""
          onGuess={onGuess}
        />
      )}
    </div>
  )
}
