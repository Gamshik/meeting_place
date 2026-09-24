import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowIcon } from '@shared/ui/ArrowIcon/ArrowIcon'

import type { Profile, ProfileActivity } from '@contracts/contracts'
import { useCommunity } from '@features/community/model/CommunityContext'
import { AppShell } from '@widgets/AppShell/AppShell'
import { ProfileActivityPanel } from '@features/profile/ui/ProfileActivityPanel/ProfileActivityPanel'
import { api } from '@shared/api/api'
import { browserTimeZone } from '@shared/lib/time-zone'

export function FriendProfilePage() {
  const { profileId = '' } = useParams()
  const { partnerships } = useCommunity()
  const [viewer, setViewer] = useState<Profile | null>(null)
  const [friend, setFriend] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api
      .getProfile()
      .then(async (response) => {
        let loadedProfile = response.data
        if (!loadedProfile.timeZone) {
          try {
            loadedProfile = (await api.updateProfile({ timeZone: browserTimeZone() })).data
          } catch {
            // Opening a friend's profile must not depend on initializing the viewer's timezone.
          }
        }
        if (active) setViewer(loadedProfile)
      })
      .catch((error) => {
        if (active)
          setError(error instanceof Error ? error.message : 'We could not open this profile.')
      })
    return () => {
      active = false
    }
  }, [])

  const handleProfileLoaded = useCallback((activity: ProfileActivity) => {
    setFriend(activity.profile)
  }, [])
  const partnership = partnerships.find(
    (item) => item.status === 'active' && item.partner.id === profileId,
  )

  if (!viewer) {
    return (
      <main className="loading-screen">
        {error ? <p role="alert">{error}</p> : <p role="status">Opening profile…</p>}
      </main>
    )
  }

  return (
    <AppShell profile={viewer}>
      <section className="friend-profile-page">
        <Link className="profile-back-link" to="/?view=friends">
          <ArrowIcon direction="left" /> Back to friends
        </Link>
        <header className="friend-profile-heading">
          <ProfileAvatar profile={friend} />
          <div className="friend-profile-identity">
            <h1>{friend?.displayName ?? 'Friend profile'}</h1>
            {friend ? <p>@{friend.username}</p> : <p>Loading profile details…</p>}
          </div>
          {partnership && friend ? (
            <Link
              className="button button-primary friend-profile-practice"
              to={`/games/explain-word/${partnership.id}`}
            >
              Practice with {friend.displayName.split(/\s+/)[0]}
              <span aria-hidden="true">
                <ArrowIcon direction="up-right" />
              </span>
            </Link>
          ) : null}
        </header>
        <ProfileActivityPanel
          profileId={profileId}
          profileName={friend?.displayName}
          onProfileLoaded={handleProfileLoaded}
        />
      </section>
    </AppShell>
  )
}

function ProfileAvatar({ profile }: { profile: Profile | null }) {
  return (
    <div className="friend-profile-avatar">
      {profile?.avatarUrl ? (
        <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span>{profile?.displayName.slice(0, 1).toUpperCase() ?? '…'}</span>
      )}
    </div>
  )
}
