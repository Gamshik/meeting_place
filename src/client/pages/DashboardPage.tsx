import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Partnership, Profile } from '../../shared/contracts'
import { useAuth } from '../auth/AuthContext'
import { useCommunity, type GameHistoryItem } from '../community/CommunityContext'
import { AppShell } from '../components/AppShell'
import { PartnerCard } from '../components/PartnerCard'
import { Panel, Notice } from '../components/Panel'
import { GameWorkspace } from '../components/GameWorkspace'
import { GameCatalog } from '../components/GameCatalog'
import { ProfileEditor } from '../components/ProfileEditor'
import { ProfileActivityPanel } from '../components/ProfileActivityPanel'
import { RoundsTable } from '../components/RoundsTable'
import { games, type GameDefinition } from '../lib/games'
import { api } from '../lib/api'
import { browserTimeZone } from '../lib/time-zone'
import { wordGameModeLabel } from '../lib/word-game-mode'

export function DashboardPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'games'
  const selectedGame = games.find((game) => game.id === params.get('game'))
  const workspaceGame = selectedGame ?? games[0]!
  const invitationView = params.get('section') === 'invitations'
  const { signOut } = useAuth()
  const { partnerships, sessions, history, isLoading, error: loadError, refresh } = useCommunity()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [panel, setPanel] = useState<string | null>(null)
  const modal = panel ?? (params.get('add') === '1' ? 'add' : null)
  const [search, setSearch] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(
    params.get('edit') === '1' || params.get('section') === 'settings',
  )
  const busy = useRef(false)
  const closeNotice = useCallback(() => setNotice(null), [])
  const closeError = useCallback(() => setError(null), [])
  const loadProfile = useCallback(async () => {
    try {
      const response = await api.getProfile()
      let loadedProfile = response.data
      if (!loadedProfile.timeZone) {
        try {
          loadedProfile = (await api.updateProfile({ timeZone: browserTimeZone() })).data
        } catch {
          // The profile and UTC-backed calendar remain usable if initial timezone saving is offline.
        }
      }
      setProfile(loadedProfile)
    } catch (error) {
      setError(messageFromError(error))
    } finally {
      setProfileLoading(false)
    }
  }, [])
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) void loadProfile()
    })
    return () => {
      active = false
    }
  }, [loadProfile])
  const friends = partnerships.filter((item) => item.status === 'active')
  const incoming = partnerships.filter(
    (item) => item.status === 'pending' && item.direction === 'incoming',
  )
  const outgoing = partnerships.filter(
    (item) => item.status === 'pending' && item.direction === 'outgoing',
  )
  const filtered = friends.filter((item) =>
    `${item.partner.displayName} ${item.partner.username}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  const availableSessions = sessions.flatMap((session) => {
    const friend = friends.find((item) => item.id === session.partnershipId)
    const game = games.find((item) => item.id === session.gameId)
    return friend && game ? [{ session, friend, game }] : []
  })
  const active = availableSessions.filter(
    ({ session }) => session.status === 'active' || session.status === 'paused',
  )
  async function run(action: () => Promise<unknown>) {
    if (busy.current) return false
    busy.current = true
    setIsBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (error) {
      setError(messageFromError(error))
      return false
    } finally {
      busy.current = false
      setIsBusy(false)
    }
  }
  async function mutate(action: () => Promise<unknown>) {
    return run(async () => {
      await action()
      await refresh()
    })
  }
  async function play(
    game: GameDefinition,
    friend: Partnership,
    action: 'invite' | 'join' | 'open',
  ) {
    if (action === 'open' || action === 'invite') {
      navigate(`${game.path}/${friend.id}${action === 'invite' ? '?new=1' : ''}`)
      return
    }
    if (await mutate(() => game.accept(friend.id))) navigate(`${game.path}/${friend.id}`)
  }
  if (profileLoading || (isLoading && !profile))
    return (
      <main className="loading-screen">
        <p>Opening Meeting Place…</p>
      </main>
    )
  if (!profile)
    return (
      <main className="loading-screen">
        <h1>Could not open your profile</h1>
        <p role="alert">{error}</p>
        <button className="button button-primary" onClick={() => void loadProfile()}>
          Try again
        </button>
      </main>
    )
  const feedback = (
    <>
      {error && <Notice error message={error} onClose={closeError} />}{' '}
      {notice && <Notice message={notice} onClose={closeNotice} />}
    </>
  )
  return (
    <AppShell profile={profile}>
      {!modal && feedback}
      {loadError && (
        <div className="inline-error" role="alert">
          {loadError}
          <button className="text-action" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}
      {view === 'profile' ? (
        <section className="account-page">
          <ProfileEditor
            key={`${profile.username}:${profile.displayName}:${profile.timeZone ?? ''}`}
            profile={profile}
            disabled={isBusy}
            isEditing={isEditingProfile}
            onToggleEdit={() => setIsEditingProfile((prev) => !prev)}
            onCloseEdit={() => setIsEditingProfile(false)}
            onSignOut={() => void run(signOut)}
            onCopy={async () => {
              if (await run(() => navigator.clipboard.writeText(profile.username)))
                setNotice('Username copied.')
            }}
            onSave={(input) =>
              run(async () => {
                const response = await api.updateProfile(input)
                setProfile(response.data)
                setNotice('Profile saved.')
              })
            }
          />
          <ProfileActivityPanel profileId={profile.id} profileName={profile.displayName} isOwner />
        </section>
      ) : view === 'history' ? (
        <HistoryView
          history={history}
          friends={friends}
          disabled={isBusy}
          onPlayAgain={(item) => {
            const friend = friends.find((candidate) => candidate.id === item.partnershipId)
            const game = games.find((candidate) => candidate.id === item.gameId)
            if (friend && game) void play(game, friend, 'invite')
          }}
        />
      ) : view === 'friends' ? (
        <section className="friends-page">
          <div className="friends-toolbar">
            <nav className="section-tabs" aria-label="Friend lists">
              <button
                aria-current={!invitationView ? 'page' : undefined}
                onClick={() => setParams({ view: 'friends' })}
              >
                Your friends
              </button>
              <button
                aria-current={invitationView ? 'page' : undefined}
                onClick={() => setParams({ view: 'friends', section: 'invitations' })}
              >
                Invitations{incoming.length > 0 ? ` (${incoming.length})` : ''}
              </button>
            </nav>
            <button className="button button-accent friends-add" onClick={() => setPanel('add')}>
              <span aria-hidden="true">＋</span> Add a friend
            </button>
          </div>
          {invitationView ? (
            <div className="invitations-list">
              {!incoming.length && !outgoing.length ? (
                <p className="compact-empty">No pending invitations.</p>
              ) : null}
              {incoming.length > 0 && (
                <ListSection title="Received">
                  {incoming.map((friend) => (
                    <PartnerCard
                      key={friend.id}
                      partnership={friend}
                      disabled={isBusy}
                      actionLabel="Accept"
                      secondaryActionLabel="Decline"
                      onAction={() => void mutate(() => api.acceptPartnership(friend.id))}
                      onSecondaryAction={() => void mutate(() => api.declinePartnership(friend.id))}
                    />
                  ))}
                </ListSection>
              )}
              {outgoing.length > 0 && (
                <ListSection title="Sent">
                  {outgoing.map((friend) => (
                    <PartnerCard
                      key={friend.id}
                      partnership={friend}
                      disabled={isBusy}
                      actionLabel="Cancel invitation"
                      onAction={() => void mutate(() => api.endPartnership(friend.id))}
                    />
                  ))}
                </ListSection>
              )}
            </div>
          ) : (
            <>
              {friends.length > 0 && (
                <label className="search-field friends-search">
                  Find a friend
                  <input
                    className="input"
                    type="search"
                    value={search}
                    placeholder="Name or username"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              )}
              <div className="friend-list">
                {filtered.map((friend) => (
                  <div className="friend-management" key={friend.id}>
                    <PartnerCard partnership={friend} />
                    <button
                      type="button"
                      className="friend-remove-trigger"
                      aria-label={`Remove ${friend.partner.displayName}`}
                      onClick={() => setPanel(`remove:${friend.id}`)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                      </svg>
                    </button>
                  </div>
                ))}
                {!filtered.length && (
                  <p className="compact-empty">
                    {friends.length ? 'No matching friends.' : 'Add a friend using their username.'}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="quick-start-shell" id="practice-games">
          <div className="practice-step-heading">
            <span aria-hidden="true">1</span>
            <h1>Choose a game</h1>
          </div>
          <GameCatalog
            items={games}
            selectedId={selectedGame?.id}
            onPlay={(game) => {
              const nextParams = new URLSearchParams(params)
              if (selectedGame?.id === game.id) nextParams.delete('game')
              else nextParams.set('game', game.id)
              setParams(nextParams, { replace: true })
            }}
          />
          {active.length > 0 ? (
            <div className="live-note" role="status">
              <span className="live-dot" aria-hidden="true" />
              {active.length === 1
                ? 'One game is ready to continue.'
                : `${active.length} games are ready to continue.`}
            </div>
          ) : null}
          <div className="practice-friend-step" data-ready={Boolean(selectedGame)}>
            <div className="practice-step-heading">
              <span aria-hidden="true">2</span>
              <h2>Choose a friend</h2>
            </div>
            {isLoading ? (
              <p role="status">Loading your friends…</p>
            ) : (
              <GameWorkspace
                key={workspaceGame.id}
                game={workspaceGame}
                gameSelected={Boolean(selectedGame)}
                friends={friends}
                sessions={sessions}
                disabled={isBusy}
                onAction={(friend, action) => play(workspaceGame, friend, action)}
              />
            )}
          </div>
          {incoming.length > 0 ? (
            <div className="quick-start-footer">
              <button
                className="text-action"
                onClick={() => setParams({ view: 'friends', section: 'invitations' })}
              >
                {incoming.length} friend {incoming.length === 1 ? 'request' : 'requests'} waiting
              </button>
            </div>
          ) : null}
        </section>
      )}
      {modal === 'add' && (
        <Panel
          title="Invite a friend"
          feedback={feedback}
          onClose={() => {
            setPanel(null)
            if (params.get('add') === '1') setParams({ view: 'friends' })
          }}
        >
          <div className="invite-intro">
            <span aria-hidden="true">@</span>
            <div>
              <strong>One username. No directory.</strong>
              <p>We’ll send a private request so you can practise together.</p>
            </div>
          </div>
          <InvitePartnerForm
            disabled={isBusy}
            onInvite={async (username) => {
              const sent = await mutate(() => api.invitePartner({ username }))
              if (sent) {
                setPanel(null)
                setParams({ view: 'friends', section: 'invitations' })
                setNotice('Invitation sent.')
              }
              return sent
            }}
          />
        </Panel>
      )}
      {panel?.startsWith('remove:') && (
        <Panel title="Remove friend?" feedback={feedback} onClose={() => setPanel(null)}>
          <p>You can invite them again after seven days.</p>
          <div className="row-actions">
            <button className="button button-secondary" onClick={() => setPanel(null)}>
              Keep friend
            </button>
            <button
              className="button button-danger"
              disabled={isBusy}
              onClick={async () => {
                if (await mutate(() => api.endPartnership(panel.slice(7)))) setPanel(null)
              }}
            >
              Remove friend
            </button>
          </div>
        </Panel>
      )}
    </AppShell>
  )
}
function HistoryView({
  history,
  friends,
  disabled,
  onPlayAgain,
}: {
  history: GameHistoryItem[]
  friends: Partnership[]
  disabled: boolean
  onPlayAgain: (item: GameHistoryItem) => void
}) {
  const pageSize = 5
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize))
  const [page, setPage] = useState(1)
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * pageSize
  const visibleHistory = history.slice(pageStart, pageStart + pageSize)

  return (
    <section className="history-page">
      <div className="history-tally" aria-label={`${history.length} finished games`}>
        <strong>{String(history.length).padStart(2, '0')}</strong>
        <span>
          <small>Practice archive</small>
          finished games
        </span>
        <i aria-hidden="true">
          <b />
          <b />
          <b />
          <b />
        </i>
      </div>

      {history.length ? (
        <>
          <div className="history-list">
            {visibleHistory.map((item, index) => {
              const game = games.find((candidate) => candidate.id === item.gameId)
              const canPlayAgain = friends.some((friend) => friend.id === item.partnershipId)
              const result =
                item.scores.you === item.scores.partner
                  ? 'Draw'
                  : item.scores.you > item.scores.partner
                    ? 'You won'
                    : `${item.partner.displayName} won`
              return (
                <article className="history-card" key={`${item.gameId}:${item.id}`}>
                  <div className="history-index" aria-hidden="true">
                    {String(pageStart + index + 1).padStart(2, '0')}
                  </div>
                  <div className="history-main">
                    <div className="history-title-row">
                      <div>
                        <p>{game?.title ?? 'English game'}</p>
                        <h2>With {item.partner.displayName}</h2>
                      </div>
                      <time dateTime={item.finishedAt}>
                        <span>{formatFinishedDate(item.finishedAt)}</span>
                        <strong>{formatFinishedTime(item.finishedAt)}</strong>
                      </time>
                    </div>
                    <div className="history-meta">
                      <span>{result}</span>
                      <span>{wordGameModeLabel(item.mode)}</span>
                      <span>{item.roundCount === 1 ? '1 round' : `${item.roundCount} rounds`}</span>
                    </div>
                  </div>
                  <div
                    className="history-score"
                    aria-label={`Score ${item.scores.you} to ${item.scores.partner}`}
                  >
                    <strong>{item.scores.you}</strong>
                    <span>—</span>
                    <strong>{item.scores.partner}</strong>
                  </div>
                  {canPlayAgain ? (
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={disabled}
                      onClick={() => onPlayAgain(item)}
                    >
                      Play again <span aria-hidden="true">↗</span>
                    </button>
                  ) : null}
                  <details className="history-rounds">
                    <summary>
                      <span>Round details</span>
                      <span>{item.roundCount}</span>
                    </summary>
                    <RoundsTable
                      rounds={item.rounds}
                      partnerId={item.partner.id}
                      partnerName={item.partner.displayName}
                    />
                  </details>
                </article>
              )
            })}
          </div>
          {pageCount > 1 ? (
            <HistoryPagination
              page={currentPage}
              pageCount={pageCount}
              firstItem={pageStart + 1}
              lastItem={Math.min(pageStart + pageSize, history.length)}
              totalItems={history.length}
              onChange={setPage}
            />
          ) : null}
        </>
      ) : (
        <div className="history-empty">
          <span aria-hidden="true">00</span>
          <h2>Your finished games will live here</h2>
          <p>Complete a game and its score, partner, rounds, and date will be saved.</p>
        </div>
      )}
    </section>
  )
}

function HistoryPagination({
  page,
  pageCount,
  firstItem,
  lastItem,
  totalItems,
  onChange,
}: {
  page: number
  pageCount: number
  firstItem: number
  lastItem: number
  totalItems: number
  onChange: (page: number) => void
}) {
  const visiblePages = Array.from(
    new Set(
      [1, page - 1, page, page + 1, pageCount].filter((item) => item > 0 && item <= pageCount),
    ),
  ).sort((left, right) => left - right)

  return (
    <nav className="history-pagination" aria-label="History pages">
      <div className="history-pagination-status" aria-live="polite">
        <span>
          Showing <strong>{firstItem}</strong>–<strong>{lastItem}</strong> of {totalItems}
        </span>
        <div aria-hidden="true">
          <i style={{ width: `${(lastItem / totalItems) * 100}%` }} />
        </div>
      </div>
      <div className="history-pagination-controls">
        <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>
          <span aria-hidden="true">←</span> Previous
        </button>
        <div className="history-page-numbers">
          {visiblePages.map((pageNumber, index) => (
            <span key={pageNumber}>
              {index > 0 && pageNumber - visiblePages[index - 1]! > 1 ? (
                <i aria-hidden="true">…</i>
              ) : null}
              <button
                type="button"
                aria-label={`Page ${pageNumber}`}
                aria-current={pageNumber === page ? 'page' : undefined}
                onClick={() => onChange(pageNumber)}
              >
                {pageNumber}
              </button>
            </span>
          ))}
        </div>
        <button type="button" disabled={page === pageCount} onClick={() => onChange(page + 1)}>
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
    </nav>
  )
}

function formatFinishedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatFinishedTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
function ListSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="list-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.'
}
function InvitePartnerForm({
  onInvite,
  disabled,
}: {
  disabled: boolean
  onInvite: (username: string) => Promise<boolean>
}) {
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting || disabled) return
    setIsSubmitting(true)

    try {
      const invitationSent = await onInvite(username)

      if (invitationSent) {
        setUsername('')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="invite-form" onSubmit={handleSubmit}>
      <label htmlFor="partner-username">Friend’s username</label>
      <div className="invite-input">
        <span aria-hidden="true">@</span>
        <input
          id="partner-username"
          autoFocus
          disabled={isSubmitting || disabled}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="their_username"
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9_]+"
          required
        />
        <button className="button button-primary" type="submit" disabled={isSubmitting || disabled}>
          {isSubmitting ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </form>
  )
}
