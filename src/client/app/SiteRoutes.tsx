import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '@features/auth/ui/AuthProvider/AuthProvider'
import { ProtectedRoute } from '@features/auth/ui/ProtectedRoute/ProtectedRoute'
import { AuthCallbackPage } from '@pages/AuthCallbackPage/AuthCallbackPage'
import { LegalPage } from '@pages/LegalPage/LegalPage'
import { LoginPage } from '@pages/LoginPage/LoginPage'
import { FullPageLoader } from '@shared/ui/FullPageLoader/FullPageLoader'

const DashboardPage = lazy(() =>
  import('@pages/DashboardPage/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
)
const ExplainWordGamePage = lazy(() =>
  import('@pages/ExplainWordGamePage/ExplainWordGamePage').then((module) => ({
    default: module.ExplainWordGamePage,
  })),
)
const FriendProfilePage = lazy(() =>
  import('@pages/FriendProfilePage/FriendProfilePage').then((module) => ({
    default: module.FriendProfilePage,
  })),
)
const AdminPage = lazy(() =>
  import('@pages/AdminPage/AdminPage').then((module) => ({ default: module.AdminPage })),
)

export default function SiteRoutes() {
  return (
    <AuthProvider>
      <Suspense fallback={<FullPageLoader label="Opening your meeting place…" />}>
        <Routes>
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route index element={<DashboardPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="profiles/:profileId" element={<FriendProfilePage />} />
            <Route path="games/explain-word/:partnershipId" element={<ExplainWordGamePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
