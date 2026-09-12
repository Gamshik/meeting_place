import type { ReactNode } from 'react'
import { NotificationCenter } from './NotificationCenter'
import { Link, useLocation } from 'react-router-dom'
import type { Profile } from '../../shared/contracts'

type AppShellProps = {
  children: ReactNode
  onNavigate?: () => void
  profile: Profile
}
export function AppShell({ children, profile, onNavigate }: AppShellProps) {
  const location = useLocation()
  const view = new URLSearchParams(location.search).get('view') ?? 'games'
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link onClick={onNavigate} className="wordmark" to="/" aria-label="Meeting Place home">
          <span className="brand-mark" aria-hidden="true">
            mp
          </span>
          <span>
            meeting
            <br />
            place
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link onClick={onNavigate} aria-current={view === 'games' ? 'page' : undefined} to="/">
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
          <Link className="header-invite" to="/?view=friends&add=1" onClick={onNavigate}>
            <span aria-hidden="true">＋</span> Invite
          </Link>
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
      </header>
      <main id="main" className="main-content">
        {children}
      </main>
    </div>
  )
}
