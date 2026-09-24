import type { WordGame } from '../../../../../../shared/contracts'
import { GameModeBadge } from '../GameModeBadge/GameModeBadge'

export function GameInvitation({
  acceptBlocked,
  disabled,
  game,
  onAccept,
  onCancel,
  onDecline,
  userId,
}: {
  acceptBlocked: boolean
  disabled: boolean
  game: WordGame
  onAccept: () => Promise<unknown>
  onCancel: () => Promise<void>
  onDecline: () => Promise<void>
  userId: string
}) {
  const isRequester = game.requestedById === userId
  const partnerInitial = game.partner.displayName.trim().charAt(0).toUpperCase() || '?'
  return (
    <section
      className={`game-invitation-card ${isRequester ? 'is-sent' : 'is-received'}`}
      role={isRequester ? 'status' : undefined}
    >
      <div className="game-invitation-avatar" aria-hidden="true">
        <span>{partnerInitial}</span>
        <i>{isRequester ? '…' : '!'}</i>
      </div>
      <div className="game-invitation-copy">
        {isRequester ? (
          <span className="game-invitation-status">Invitation sent</span>
        ) : (
          <GameModeBadge mode={game.mode} />
        )}
        <h2>
          {isRequester
            ? `Waiting for ${game.partner.displayName}`
            : `${game.partner.displayName} invited you`}
        </h2>
        {isRequester ? (
          <span className="game-invitation-waiting-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {!isRequester ? (
          <p>Join the shared game now. The player who sent the invitation will explain first.</p>
        ) : null}
        {!isRequester && acceptBlocked ? (
          <p className="game-lobby-blocked" role="status">
            Finish your current game before accepting this invitation.
          </p>
        ) : null}
      </div>
      <div className="game-invitation-actions">
        {isRequester ? (
          <button
            type="button"
            className="game-cancel-invitation"
            disabled={disabled}
            onClick={() => void onCancel()}
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              className="button button-primary"
              disabled={disabled || acceptBlocked}
              onClick={() => void onAccept()}
            >
              {disabled
                ? 'Starting…'
                : acceptBlocked
                  ? 'Finish your current game first'
                  : 'Accept and play'}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled}
              onClick={() => void onDecline()}
            >
              Decline
            </button>
          </>
        )}
      </div>
    </section>
  )
}
