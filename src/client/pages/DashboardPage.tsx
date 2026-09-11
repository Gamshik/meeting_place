import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import type { Partnership, Profile } from '../../shared/contracts'
import { useAuth } from '../auth/AuthContext'
import { AppShell } from '../components/AppShell'
import { PartnerCard } from '../components/PartnerCard'
import { api, ApiError } from '../lib/api'

export function DashboardPage() {
  const { signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    setError(null)

    try {
      const [profileResponse, partnershipsResponse] = await Promise.all([
        api.getProfile(),
        api.getPartnerships(),
      ])
      setProfile(profileResponse.data)
      setPartnerships(partnershipsResponse.data)
    } catch (loadError) {
      setError(messageFromError(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadDashboard)
  }, [loadDashboard])

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

  async function runPartnershipAction(action: () => Promise<unknown>) {
    setError(null)

    try {
      await action()
      await loadDashboard()
      return true
    } catch (actionError) {
      setError(messageFromError(actionError))
      return false
    }
  }

  return (
    <AppShell profile={profile} onSignOut={() => void signOut()}>
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
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-6">
          <InvitePartnerForm
            onInvite={(username) => runPartnershipAction(() => api.invitePartner({ username }))}
          />
          <ProfileCard profile={profile} onProfileUpdated={setProfile} />
        </div>

        <div className="space-y-8">
          {groups.incoming.length > 0 ? (
            <PartnerSection title="Invitations for you" count={groups.incoming.length}>
              {groups.incoming.map((partnership) => (
                <PartnerCard
                  key={partnership.id}
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

          <PartnerSection title="Your partners" count={groups.active.length}>
            {groups.active.length > 0 ? (
              groups.active.map((partnership) => (
                <PartnerCard
                  key={partnership.id}
                  partnership={partnership}
                  actionLabel="End partnership"
                  destructiveAction
                  onAction={() =>
                    void runPartnershipAction(() => api.endPartnership(partnership.id))
                  }
                />
              ))
            ) : (
              <EmptyState />
            )}
          </PartnerSection>

          {groups.outgoing.length > 0 ? (
            <PartnerSection title="Waiting for a reply" count={groups.outgoing.length}>
              {groups.outgoing.map((partnership) => (
                <PartnerCard
                  key={partnership.id}
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
        </div>
      </div>
    </AppShell>
  )
}

function InvitePartnerForm({ onInvite }: { onInvite: (username: string) => Promise<boolean> }) {
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
          className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-stone-900 outline-none"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="martyna_english"
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9_]+"
          required
        />
        <button className="button button-accent" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Invite'}
        </button>
      </div>
      {sent ? <p className="mt-3 text-sm text-emerald-200">Invitation sent.</p> : null}
    </form>
  )
}

function ProfileCard({
  onProfileUpdated,
  profile,
}: {
  onProfileUpdated: (profile: Profile) => void
  profile: Profile
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [username, setUsername] = useState(profile.username)
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      const response = await api.updateProfile({ username, displayName })
      onProfileUpdated(response.data)
      setIsEditing(false)
    } catch (updateError) {
      setError(messageFromError(updateError))
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
          onClick={() => setIsEditing((value) => !value)}
        >
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {isEditing ? (
        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">
            Display name
            <input
              className="input mt-1.5"
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
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]+"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button className="button button-primary w-full justify-center" type="submit">
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

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
      <p className="font-medium text-stone-700">No active partners yet</p>
      <p className="mt-2 text-sm text-stone-500">Invite someone using the form on the left.</p>
    </div>
  )
}

function messageFromError(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return 'Something went wrong.'
}
