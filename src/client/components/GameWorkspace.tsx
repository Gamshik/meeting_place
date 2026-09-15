import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Partnership } from '../../shared/contracts'
import type { GameSession } from '../community/CommunityContext'
import { useAuth } from '../auth/AuthContext'
import type { GameDefinition } from '../lib/games'

export function GameWorkspace({
  game,
  friends,
  sessions,
  disabled,
  gameSelected,
  onAction,
}: {
  game: GameDefinition
  friends: Partnership[]
  sessions: GameSession[]
  disabled: boolean
  gameSelected: boolean
  onAction: (friend: Partnership, action: 'invite' | 'join' | 'open') => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [pendingFriend, setPendingFriend] = useState<string | null>(null)
  const { session } = useAuth()
  const ongoingSession = sessions.find(
    (item) => item.status === 'active' || item.status === 'paused',
  )
  const byFriend = new Map(
    sessions.filter((item) => item.gameId === game.id).map((item) => [item.partnershipId, item]),
  )
  const priority = (friend: Partnership) => {
    const current = byFriend.get(friend.id)
    return current?.status === 'active' || current?.status === 'paused'
      ? 0
      : current?.status === 'pending'
        ? 1
        : 2
  }
  const matches = friends
    .filter((item) =>
      `${item.partner.displayName} ${item.partner.username}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )
    .sort(
      (left, right) =>
        priority(left) - priority(right) ||
        left.partner.displayName.localeCompare(right.partner.displayName),
    )
  return (
    <section
      className="game-workspace"
      aria-label={`Choose a friend for ${game.title}`}
      data-ready={gameSelected}
    >
      {friends.length ? (
        <>
          {friends.length > 4 ? (
            <label className="search-field quick-search">
              <span>Play with</span>
              <input
                className="input"
                type="search"
                placeholder="Find a friend"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          ) : (
            <label className="sr-only">
              Play with
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
          <div className="play-friends">
            {matches.map((friend) => {
              const existing = sessions.find(
                (item) => item.gameId === game.id && item.partnershipId === friend.id,
              )
              const action =
                !existing || existing.status === 'finished'
                  ? 'invite'
                  : existing.status === 'pending' && existing.requestedById !== session?.user.id
                    ? 'join'
                    : 'open'
              const initials = friend.partner.displayName
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
              return (
                <article className={`quick-friend quick-friend-${action}`} key={friend.id}>
                  <div className="quick-friend-person">
                    {friend.partner.avatarUrl ? (
                      <img src={friend.partner.avatarUrl} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="quick-avatar" aria-hidden="true">
                        {initials}
                      </span>
                    )}
                    <div>
                      <h3>{friend.partner.displayName}</h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`button ${action === 'join' ? 'button-accent' : 'button-primary'} quick-play-button`}
                    disabled={
                      !gameSelected ||
                      disabled ||
                      pendingFriend !== null ||
                      (Boolean(ongoingSession) && (action === 'invite' || action === 'join'))
                    }
                    onClick={() => {
                      setPendingFriend(friend.id)
                      void onAction(friend, action).finally(() => setPendingFriend(null))
                    }}
                  >
                    {action === 'invite' ? 'Start' : action === 'join' ? 'Join' : 'Continue'}
                  </button>
                </article>
              )
            })}
            {!matches.length && <p className="compact-empty">No friends match “{search}”.</p>}
          </div>
        </>
      ) : (
        <div className="quick-empty">
          <span className="quick-empty-icon" aria-hidden="true">
            +1
          </span>
          <h3>Your first round starts with a friend</h3>
          <p>Invite someone by username. As soon as they accept, they appear right here.</p>
          <Link className="button button-accent" to="/?view=friends&add=1">
            Invite your first friend
          </Link>
        </div>
      )}
    </section>
  )
}
