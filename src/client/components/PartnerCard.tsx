import type { Partnership } from '../../shared/contracts'
import { Link } from 'react-router-dom'

type PartnerCardProps = {
  disabled?: boolean
  actionLabel?: string
  destructiveAction?: boolean
  secondaryDestructiveAction?: boolean
  onAction?: () => void
  onSecondaryAction?: () => void
  partnership: Partnership
  secondaryActionLabel?: string
}

export function PartnerCard({
  disabled = false,
  actionLabel,
  destructiveAction = false,
  onAction,
  onSecondaryAction,
  partnership,
  secondaryActionLabel,
  secondaryDestructiveAction = false,
}: PartnerCardProps) {
  const initials = partnership.partner.displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const identity = (
    <>
      {partnership.partner.avatarUrl ? (
        <img
          className="size-12 rounded-2xl object-cover"
          src={partnership.partner.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-stone-200 font-semibold text-stone-900">
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="truncate font-semibold">{partnership.partner.displayName}</h3>
        <p className="truncate text-sm text-stone-500">@{partnership.partner.username}</p>
      </div>
    </>
  )

  return (
    <article className="friend-row">
      {partnership.status === 'active' ? (
        <Link
          className="friend-profile-link flex min-w-0 items-center gap-4"
          to={`/profiles/${partnership.partner.id}`}
          aria-label={`View ${partnership.partner.displayName}’s profile`}
        >
          {identity}
        </Link>
      ) : (
        <div className="flex min-w-0 items-center gap-4">{identity}</div>
      )}

      {actionLabel || secondaryActionLabel ? (
        <div className="flex gap-2">
          {secondaryActionLabel ? (
            <button
              disabled={disabled}
              className={`button ${secondaryDestructiveAction ? 'button-danger' : 'button-secondary'}`}
              type="button"
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          {actionLabel ? (
            <button
              disabled={disabled}
              className={`button ${destructiveAction ? 'button-danger' : 'button-primary'}`}
              type="button"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
