import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { lazy } from 'react'
const CommunityProvider = lazy(() =>
  import('@features/community/ui/CommunityProvider/CommunityProvider').then((module) => ({
    default: module.CommunityProvider,
  })),
)
import { useAuth } from '@features/auth/model/AuthContext'

export function ProtectedRoute() {
  const { isLoading, session } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullPageLoader label="Preparing your meeting place…" />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return (
    <CommunityProvider key={session.user.id}>
      <Outlet />
    </CommunityProvider>
  )
}

export function FullPageLoader({ label }: { label: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-6 text-stone-700">
      <div className="flex items-center gap-3" role="status">
        <span className="size-3 animate-pulse rounded-full bg-emerald-700" />
        <span>{label}</span>
      </div>
    </main>
  )
}
