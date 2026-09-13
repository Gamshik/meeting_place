import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Partnership, Profile } from '../../shared/contracts'
import { useAuth } from '../auth/AuthContext'
import { useCommunity, type GameHistoryItem } from '../community/CommunityContext'
import { AppShell } from '../components/AppShell'
import { PartnerCard } from '../components/PartnerCard'
import { Panel, Notice } from '../components/Panel'
import { GameWorkspace } from '../components/GameWorkspace'
import { ProfileEditor } from '../components/ProfileEditor'
import { ProfileActivityPanel } from '../components/ProfileActivityPanel'
import { RoundsTable } from '../components/RoundsTable'
import { games, type GameDefinition } from '../lib/games'
import { api } from '../lib/api'
import { browserTimeZone } from '../lib/time-zone'

export function DashboardPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'games'
  const selectedGame = games.find((game) => game.id === params.get('game')) ?? games[0]!
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
    if (action === 'open') {
      navigate(`${game.path}/${friend.id}`)
      return
    }
    if (await mutate(() => (action === 'join' ? game.accept(friend.id) : game.start(friend.id))))
      navigate(`${game.path}/${friend.id}`)
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
          <div className="friends-hero">
            <div>
              <p className="eyebrow">Your circle</p>
              <h1>Friends</h1>
              <p>People you trust, ready for real English practice.</p>
            </div>
            <button className="button button-accent" onClick={() => setPanel('add')}>
              <span aria-hidden="true">＋</span> Add a friend
            </button>
          </div>
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
                    <details className="friend-options">
                      <summary aria-label={`Manage ${friend.partner.displayName}`}>•••</summary>
                      <button onClick={() => setPanel(`remove:${friend.id}`)}>Remove friend</button>
                    </details>
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
        <>
          <section className="practice-hero">
            <div className="practice-hero-copy">
              <p className="eyebrow">English, together</p>
              <h1>
                Skip the small talk.
                <span> Start speaking.</span>
              </h1>
              <p className="practice-intro">
                Pick a friend and go. We prepare the game, open the room, and give you something
                worth talking about.
              </p>
              <div className="practice-actions">
                <button className="button button-accent" onClick={() => setPanel('add')}>
                  Invite someone
                  <span aria-hidden="true">↗</span>
                </button>
                <span className="handle-chip">You’re @{profile.username}</span>
              </div>
            </div>
            <div className="practice-card-stack" aria-hidden="true">
              <div className="prompt-card prompt-card-back">
                <span>01</span>
                <strong>listen</strong>
                <i>↗</i>
              </div>
              <div className="prompt-card prompt-card-front">
                <div className="prompt-card-top">
                  <span>Explain the word</span>
                  <span>5–10 min</span>
                </div>
                <strong>Imagine.</strong>
                <div className="prompt-wave">
                  {[28, 52, 38, 72, 48, 82, 56, 34, 64, 40].map((height, index) => (
                    <i key={index} style={{ height }} />
                  ))}
                </div>
                <span>No prep. Just play.</span>
              </div>
            </div>
          </section>

          <section className="quick-start-shell">
            <div className="quick-start-heading">
              <div>
                <p className="eyebrow">Quick start</p>
                <h2>Who are you practising with?</h2>
                <p>Choose a person. Explain the word is already selected.</p>
              </div>
              <div className="game-pill" aria-label={`${selectedGame.title}, five to ten minutes`}>
                <span className="game-pill-icon" aria-hidden="true">
                  Aa
                </span>
                <span>
                  <strong>{selectedGame.title}</strong>
                  <small>5–10 min · 2 players</small>
                </span>
              </div>
            </div>
            {active.length > 0 ? (
              <div className="live-note" role="status">
                <span className="live-dot" aria-hidden="true" />
                {active.length === 1
                  ? 'One game is ready to continue.'
                  : `${active.length} games are ready to continue.`}
              </div>
            ) : null}
            {isLoading ? (
              <p role="status">Loading your friends…</p>
            ) : (
              <GameWorkspace
                key={selectedGame.id}
                game={selectedGame}
                friends={friends}
                sessions={sessions}
                disabled={isBusy}
                onAction={(friend, action) => play(selectedGame, friend, action)}
              />
            )}
            <div className="quick-start-footer">
              <p>
                Someone missing?{' '}
                <button className="text-action" onClick={() => setPanel('add')}>
                  Invite them by username
                </button>
              </p>
              {incoming.length > 0 ? (
                <button
                  className="text-action"
                  onClick={() => setParams({ view: 'friends', section: 'invitations' })}
                >
                  {incoming.length} friend {incoming.length === 1 ? 'request' : 'requests'} waiting
                </button>
              ) : null}
            </div>
          </section>
        </>
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
  return (
    <section className="history-page">
      <div className="history-hero">
        <div>
          <p className="eyebrow">Every finished game</p>
          <h1>History</h1>
          <p>Your complete practice trail—not only the latest match.</p>
        </div>
        <div className="history-count" aria-label={`${history.length} finished games`}>
          <strong>{history.length}</strong>
          <span>{history.length === 1 ? 'game' : 'games'}</span>
        </div>
      </div>

      {history.length ? (
        <div className="history-list">
          {history.map((item, index) => {
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
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="history-main">
                  <div className="history-title-row">
                    <div>
                      <p>{game?.title ?? 'English game'}</p>
                      <h2>With {item.partner.displayName}</h2>
                    </div>
                    <time dateTime={item.finishedAt}>{formatFinishedAt(item.finishedAt)}</time>
                  </div>
                  <div className="history-meta">
                    <span>{result}</span>
                    <span>{item.roundCount === 1 ? '1 round' : `${item.roundCount} rounds`}</span>
                    <span>@{item.partner.username}</span>
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

function formatFinishedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
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
