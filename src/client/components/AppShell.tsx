import type { ReactNode } from 'react'

import type { Profile } from '../../shared/contracts'

type AppShellProps = {
  children: ReactNode
  onSignOut: () => void
  profile: Profile
}

export function AppShell({ children, onSignOut, profile }: AppShellProps) {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-emerald-950 text-lg text-amber-300">
              M
            </div>
            <div>
              <p className="font-serif text-lg font-semibold leading-tight">Meeting Place</p>
              <p className="text-xs text-stone-500">English grows through conversation</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{profile.displayName}</p>
              <p className="text-xs text-stone-500">@{profile.username}</p>
            </div>
            {profile.avatarUrl ? (
              <img
                className="size-9 rounded-full object-cover ring-2 ring-stone-200"
                src={profile.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : null}
            <button className="button button-secondary" type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">{children}</main>
    </div>
  )
}
