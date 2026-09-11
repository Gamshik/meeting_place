import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import type {
  Partnership,
  PartnershipCursor,
  Profile,
  WordGameSummary,
} from '../../shared/contracts'
import { useAuth } from '../auth/AuthContext'
import { AppShell } from '../components/AppShell'
import { PartnerCard } from '../components/PartnerCard'
import { api, ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'

export function DashboardPage() {
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [wordGames, setWordGames] = useState<Record<string, WordGameSummary>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isBusy, setIsBusy] = useState(false)
  const busy = useRef(false)
  const generation = useRef(0)
  const partnershipGeneration = useRef(0)
  const [nextCursor, setNextCursor] = useState<PartnershipCursor | null>(null)

  const loadDashboard = useCallback(async () => {
    const request = ++generation.current
    const partnershipRequest = ++partnershipGeneration.current
    setError(null)

    try {
      const [profileResponse, partnershipsResponse, wordGamesResponse] = await Promise.all([
        api.getProfile(),
        api.getPartnerships(),
        api.getWordGames(),
      ])
      if (request !== generation.current) return false
      setProfile(profileResponse.data)
      if (partnershipRequest === partnershipGeneration.current) {
        setNextCursor(partnershipsResponse.nextCursor)
        setPartnerships(partnershipsResponse.data)
        setWordGames(indexWordGames(wordGamesResponse.data))
      }
      return true
    } catch (loadError) {
      if (request === generation.current) setError(messageFromError(loadError))
      return false
    } finally {
      if (request === generation.current) setIsLoading(false)
    }
  }, [])

  const refreshPartnerships = useCallback(async () => {
    const request = ++partnershipGeneration.current

    try {
      const [response, wordGamesResponse] = await Promise.all([
        api.getPartnerships(),
        api.getWordGames(),
      ])
      if (request !== partnershipGeneration.current) return false
      setNextCursor(response.nextCursor)
      setPartnerships(response.data)
      setWordGames(indexWordGames(wordGamesResponse.data))
      return true
    } catch (loadError) {
      if (request === partnershipGeneration.current) setError(messageFromError(loadError))
      return false
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) return loadDashboard()
    })
    return () => {
      active = false
      generation.current += 1
      partnershipGeneration.current += 1
    }
  }, [loadDashboard])

  const userId = session?.user.id
  const dashboardReady = profile !== null

  useEffect(() => {
    if (!dashboardReady || !userId) return

    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => void refreshPartnerships(), 150)
    }
    const channel = supabase
      .channel(`partnerships:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partnerships' },
        scheduleRefresh,
      )
      .subscribe((status, subscriptionError) => {
        if (status === 'SUBSCRIBED') scheduleRefresh()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Partnership realtime subscription failed', {
            error: subscriptionError,
            status,
          })
        }
      })

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [dashboardReady, refreshPartnerships, userId])

  useEffect(() => {
    if (!dashboardReady) return
    const timer = setInterval(() => void refreshPartnerships(), 3000)
    return () => clearInterval(timer)
  }, [dashboardReady, refreshPartnerships])

  const groups = useMemo(
    () => ({
      active: partnerships.filter((item) => item.status === 'active'),
      incoming: partnerships.filter(
        (item) => item.status === 'pending' && item.direction === 'incoming',
      ),
      outgoing: partnerships.filter(
        (item) => item.status === 'pending' && item.direction === 'outgoing',
      ),
    }),
    [partnerships],
  )
  const gameItems = useMemo(
    () =>
      groups.active.flatMap((partnership) => {
        const game = wordGames[partnership.id]
        return game ? [{ game, partnership }] : []
      }),
    [groups.active, wordGames],
  )

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100">
        <p className="text-stone-600">Loading your partners…</p>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 px-5">
        <div className="max-w-md rounded-3xl border border-stone-200 bg-white p-7 text-center shadow-sm">
          <h1 className="font-serif text-2xl font-semibold">
            We could not open your meeting place
          </h1>
          <p className="mt-3 text-stone-600">{error ?? 'Please try again in a moment.'}</p>
          <button
            className="button button-primary mt-6"
            type="button"
            onClick={() => {
              setIsLoading(true)
              void loadDashboard()
            }}
          >
            Try again
          </button>
        </div>
      </main>
    )
  }

  async function runOperation(action: () => Promise<void>) {
    if (busy.current) return false
    busy.current = true
    setIsBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (actionError) {
      setError(messageFromError(actionError))
      return false
    } finally {
      busy.current = false
      setIsBusy(false)
    }
  }

  async function runPartnershipAction(action: () => Promise<unknown>) {
    return runOperation(async () => {
      await action()
      await refreshPartnerships()
    })
  }

  async function loadMore() {
    if (!nextCursor) return
    const cursor = nextCursor
    const request = partnershipGeneration.current
    await runOperation(async () => {
      const response = await api.getPartnerships(cursor)
      if (request !== partnershipGeneration.current) return
      setPartnerships((current) => {
        const ids = new Set(current.map((item) => item.id))
        return [...current, ...response.data.filter((item) => !ids.has(item.id))]
      })
      setNextCursor(response.nextCursor)
    })
  }

  async function startNewGame(partnershipId: string) {
    const started = await runOperation(async () => {
      await api.startWordGame(partnershipId)
    })
    if (started) navigate(`/games/explain-word/${partnershipId}`)
  }

  return (
    <AppShell profile={profile} isBusy={isBusy} onSignOut={() => void runOperation(signOut)}>
      <section className="mb-10 grid gap-6 lg:grid-cols-[1fr_0.75fr] lg:items-end">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
            Your learning circle
          </p>
          <h1 className="max-w-2xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
            Who would you like to practise with?
          </h1>
        </div>
        <p className="max-w-xl text-base leading-7 text-stone-600 lg:justify-self-end">
          Every partnership is private and always contains exactly two people. Invite someone using
          their username.
        </p>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-6">
          <InvitePartnerForm
            disabled={isBusy}
            onInvite={(username) => runPartnershipAction(() => api.invitePartner({ username }))}
          />
          <ProfileCard
            profile={profile}
            disabled={isBusy}
            onSave={(input) =>
              runOperation(async () => {
                generation.current += 1
                const response = await api.updateProfile(input)
                setProfile(response.data)
              })
            }
          />
        </div>

        <div className="space-y-8">
          {groups.incoming.length > 0 ? (
            <PartnerSection title="Invitations for you" count={groups.incoming.length}>
              {groups.incoming.map((partnership) => (
                <PartnerCard
                  key={partnership.id}
                  disabled={isBusy}
                  partnership={partnership}
                  actionLabel="Accept"
                  secondaryActionLabel="Decline"
                  onAction={() =>
                    void runPartnershipAction(() => api.acceptPartnership(partnership.id))
                  }
                  onSecondaryAction={() =>
                    void runPartnershipAction(() => api.declinePartnership(partnership.id))
                  }
                />
              ))}
            </PartnerSection>
          ) : null}

          {gameItems.length > 0 ? (
            <GamesDashboard
              disabled={isBusy}
              items={gameItems}
              userId={userId}
              onOpen={(partnershipId) => navigate(`/games/explain-word/${partnershipId}`)}
              onPlayAgain={(partnershipId) => void startNewGame(partnershipId)}
            />
          ) : null}

          <PartnerSection title="Your partners" count={groups.active.length}>
            {groups.active.length > 0 ? (
              groups.active.map((partnership) => {
                const wordGame = wordGames[partnership.id]
                return (
                  <PartnerCard
                    key={partnership.id}
                    disabled={isBusy}
                    partnership={partnership}
                    actionLabel={!wordGame || wordGame.status === 'finished' ? 'Play' : undefined}
                    secondaryActionLabel="End partnership"
                    secondaryDestructiveAction
                    onAction={() => {
                      if (wordGame?.status === 'finished') {
                        void startNewGame(partnership.id)
                      } else {
                        navigate(`/games/explain-word/${partnership.id}`)
                      }
                    }}
                    onSecondaryAction={() =>
                      void runPartnershipAction(() => api.endPartnership(partnership.id))
                    }
                  />
                )
              })
            ) : (
              <EmptyState hasMore={nextCursor !== null} />
            )}
          </PartnerSection>

          {groups.outgoing.length > 0 ? (
            <PartnerSection title="Waiting for a reply" count={groups.outgoing.length}>
              {groups.outgoing.map((partnership) => (
                <PartnerCard
                  key={partnership.id}
                  disabled={isBusy}
                  partnership={partnership}
                  actionLabel="Cancel"
                  destructiveAction
                  onAction={() =>
                    void runPartnershipAction(() => api.endPartnership(partnership.id))
                  }
                />
              ))}
            </PartnerSection>
          ) : null}
          {nextCursor ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={isBusy}
              onClick={() => void loadMore()}
            >
              Load more partners and invitations
            </button>
          ) : null}
          {isBusy ? (
            <p role="status" className="text-sm text-stone-600">
              Updating your meeting place…
            </p>
          ) : null}
        </div>
      </div>
    </AppShell>
  )
}

function GamesDashboard({
  disabled,
  items,
  onOpen,
  onPlayAgain,
  userId,
}: {
  disabled: boolean
  items: Array<{ game: WordGameSummary; partnership: Partnership }>
  onOpen: (partnershipId: string) => void
  onPlayAgain: (partnershipId: string) => void
  userId: string | undefined
}) {
  return (
    <PartnerSection title="Your games" count={items.length}>
      {items.map(({ game, partnership }) => {
        const status =
          game.status === 'finished'
            ? 'Finished'
            : game.status === 'paused'
              ? 'Paused · reconnecting'
              : game.status === 'active'
                ? 'In progress'
                : game.requestedById === userId
                  ? 'Waiting for partner'
                  : 'Ready for your response'
        return (
          <article
            key={partnership.id}
            className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-emerald-800">Explain the word</p>
                <h3 className="mt-1 text-lg font-semibold">
                  With {partnership.partner.displayName}
                </h3>
                <p className="mt-1 text-sm text-stone-600">{status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={disabled}
                  onClick={() => onOpen(partnership.id)}
                >
                  {game.status === 'finished' ? 'View final score' : 'Open game'}
                </button>
                {game.status === 'finished' ? (
                  <button
                    type="button"
                    className="button button-accent"
                    disabled={disabled}
                    onClick={() => onPlayAgain(partnership.id)}
                  >
                    Play again
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        )
      })}
    </PartnerSection>
  )
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
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting || disabled) return
    setIsSubmitting(true)
    setSent(false)

    try {
      const invitationSent = await onInvite(username)

      if (invitationSent) {
        setUsername('')
        setSent(true)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="rounded-3xl bg-emerald-950 p-6 text-white shadow-lg" onSubmit={handleSubmit}>
      <p className="text-sm font-medium text-amber-300">Invite a partner</p>
      <h2 className="mt-2 font-serif text-2xl font-semibold">Start learning together</h2>
      <label className="mt-6 block text-sm text-emerald-100" htmlFor="partner-username">
        Their username
      </label>
      <div className="mt-2 flex rounded-xl bg-white p-1">
        <span className="self-center pl-3 text-stone-400">@</span>
        <input
          id="partner-username"
          disabled={isSubmitting || disabled}
          className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-stone-900 outline-none"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="martyna_english"
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9_]+"
          required
        />
        <button className="button button-accent" type="submit" disabled={isSubmitting || disabled}>
          {isSubmitting ? 'Sending…' : 'Invite'}
        </button>
      </div>
      {sent ? (
        <p role="status" className="mt-3 text-sm text-emerald-200">
          Invitation sent.
        </p>
      ) : null}
    </form>
  )
}

function ProfileCard({
  onSave,
  profile,
  disabled,
}: {
  onSave: (input: { username: string; displayName: string }) => Promise<boolean>
  profile: Profile
  disabled: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [username, setUsername] = useState(profile.username)
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    setSaved(false)
    if (await onSave({ username, displayName })) {
      setIsEditing(false)
      setSaved(true)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">Your profile</p>
          <h2 className="mt-1 font-semibold">How partners find you</h2>
        </div>
        <button
          className="text-sm font-medium text-emerald-800 hover:text-emerald-950"
          type="button"
          disabled={disabled}
          onClick={() => {
            setUsername(profile.username)
            setDisplayName(profile.displayName)
            setSaved(false)
            setIsEditing((value) => !value)
          }}
        >
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {saved ? (
        <p role="status" className="mt-3 text-sm text-emerald-800">
          Profile saved.
        </p>
      ) : null}
      {isEditing ? (
        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">
            Display name
            <input
              className="input mt-1.5"
              disabled={disabled}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Username
            <input
              className="input mt-1.5"
              disabled={disabled}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]+"
              required
            />
          </label>
          <button
            className="button button-primary w-full justify-center"
            type="submit"
            disabled={disabled}
          >
            Save profile
          </button>
        </form>
      ) : (
        <div className="mt-5 rounded-2xl bg-stone-100 p-4">
          <p className="font-medium">{profile.displayName}</p>
          <p className="mt-1 text-sm text-stone-500">@{profile.username}</p>
        </div>
      )}
    </section>
  )
}

function PartnerSection({
  children,
  count,
  title,
}: {
  children: React.ReactNode
  count: number
  title: string
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-serif text-2xl font-semibold">{title}</h2>
        <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function EmptyState({ hasMore }: { hasMore: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
      <p className="font-medium text-stone-700">
        {hasMore ? 'No active partners loaded yet' : 'No active partners yet'}
      </p>
      <p className="mt-2 text-sm text-stone-500">
        {hasMore
          ? 'Load more to see older partners and invitations.'
          : 'Invite someone using the invitation form.'}
      </p>
    </div>
  )
}

function messageFromError(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return 'Something went wrong.'
}

function indexWordGames(games: WordGameSummary[]) {
  return Object.fromEntries(games.map((game) => [game.partnershipId, game]))
}
