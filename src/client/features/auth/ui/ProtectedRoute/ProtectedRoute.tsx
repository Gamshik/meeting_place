import { FullPageLoader } from '@shared/ui/FullPageLoader/FullPageLoader'
export { FullPageLoader } from '@shared/ui/FullPageLoader/FullPageLoader'
import { LegalGate } from '@features/auth/ui/LegalGate/LegalGate'
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
    <LegalGate key={session.user.id}>
      <CommunityProvider>
        <Outlet />
      </CommunityProvider>
    </LegalGate>
  )
}
