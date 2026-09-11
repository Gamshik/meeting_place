import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { isLoading, session } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullPageLoader label="Preparing your meeting place…" />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet key={session.user.id} />
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
