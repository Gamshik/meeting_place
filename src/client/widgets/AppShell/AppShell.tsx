import { useState, type ReactNode } from 'react'
import { NotificationCenter } from '@features/notifications/ui/NotificationCenter/NotificationCenter'
import { Link, useLocation } from 'react-router-dom'
import type { Profile } from '@contracts/contracts'
import { InvitePartnerPanel } from '@features/partnerships/ui/InvitePartnerPanel/InvitePartnerPanel'

type AppShellProps = {
  children: ReactNode
  onNavigate?: () => void
  profile: Profile
  variant?: 'default' | 'room'
}
export function AppShell({ children, profile, onNavigate, variant = 'default' }: AppShellProps) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const location = useLocation()
  const view = location.pathname.startsWith('/profiles/')
    ? 'friend-profile'
    : (new URLSearchParams(location.search).get('view') ?? 'games')
  return (
    <div className={`app-shell ${variant === 'room' ? 'app-shell-room' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {variant === 'default' ? (
        <header className="site-header">
          <Link onClick={onNavigate} className="wordmark" to="/" aria-label="Meeting Place home">
            <span className="brand-mark" aria-hidden="true">
              mp
            </span>
            <span>
              meeting
              <span className="brand-dot" aria-hidden="true" />
              <br />
              place
            </span>
          </Link>
          <>
            <nav aria-label="Main navigation">
              <Link
                onClick={onNavigate}
                aria-current={view === 'games' ? 'page' : undefined}
                to="/"
              >
                Practice
              </Link>
              <Link
                onClick={onNavigate}
                aria-current={view === 'history' ? 'page' : undefined}
                to="/?view=history"
              >
                History
              </Link>
              <Link
                onClick={onNavigate}
                aria-current={view === 'friends' ? 'page' : undefined}
                to="/?view=friends"
              >
                Friends
              </Link>
            </nav>
            <div className="header-actions">
              <button
                className="header-invite"
                type="button"
                aria-label="Invite a friend"
                onClick={() => setInviteOpen(true)}
              >
                <span className="header-invite-icon" aria-hidden="true">
                  ＋
                </span>
                <span className="header-invite-label">Invite</span>
              </button>
              <NotificationCenter onNavigate={onNavigate} />
              <Link
                onClick={onNavigate}
                className="profile-link"
                to="/?view=profile"
                aria-label="Your profile"
                aria-current={view === 'profile' ? 'page' : undefined}
              >
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>
                )}
              </Link>
            </div>
          </>
        </header>
      ) : null}
      <main id="main" className="main-content">
        {children}
      </main>
      {variant === 'default' && inviteOpen ? (
        <InvitePartnerPanel onClose={() => setInviteOpen(false)} />
      ) : null}
    </div>
  )
}
