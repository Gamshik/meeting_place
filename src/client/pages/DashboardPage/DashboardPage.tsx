import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Partnership, Profile } from '@contracts/contracts'
import { useAuth } from '@features/auth/model/AuthContext'
import { useCommunity } from '@features/community/model/CommunityContext'
import { AppShell } from '@widgets/AppShell/AppShell'
import { PartnerCard } from '@features/partnerships/ui/PartnerCard/PartnerCard'
import { Panel, Notice } from '@shared/ui/Panel/Panel'
import { GameWorkspace } from '@features/games/catalog/ui/GameWorkspace/GameWorkspace'
import { GameCatalog } from '@features/games/catalog/ui/GameCatalog/GameCatalog'
import { ProfileEditor } from '@features/profile/ui/ProfileEditor/ProfileEditor'
import { ProfileActivityPanel } from '@features/profile/ui/ProfileActivityPanel/ProfileActivityPanel'
import { games, type GameDefinition } from '@features/games/catalog/model/games'
import { api } from '@shared/api/api'
import { browserTimeZone } from '@shared/lib/time-zone'
import { HistoryView } from '@features/games/history/ui/HistoryView/HistoryView'
import { InvitePartnerForm } from '@features/partnerships/ui/InvitePartnerForm/InvitePartnerForm'

const dashboardScrollPositions = new Map<string, number>()

export function DashboardPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'games'
  useDashboardScrollPosition(view)
  const highlightedHistoryId = params.get('highlight')
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
  useEffect(() => {
    if (view === 'history' && highlightedHistoryId) void refresh()
  }, [highlightedHistoryId, refresh, view])
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
          highlightedId={highlightedHistoryId}
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

function useDashboardScrollPosition(view: string) {
  useLayoutEffect(() => {
    const savedPosition = dashboardScrollPositions.get(view) ?? 0
    window.scrollTo({ top: savedPosition, left: 0, behavior: 'auto' })

    // Restore once more after layout settles so a taller view can return to its
    // previous position without inheriting the page that was just left.
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: savedPosition, left: 0, behavior: 'auto' })
    })
    const rememberPosition = () => dashboardScrollPositions.set(view, window.scrollY)
    window.addEventListener('scroll', rememberPosition, { passive: true })

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', rememberPosition)
      dashboardScrollPositions.set(view, window.scrollY)
    }
  }, [view])
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
