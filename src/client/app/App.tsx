import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../features/auth/ui/AuthProvider/AuthProvider'
import { FullPageLoader, ProtectedRoute } from '../features/auth/ui/ProtectedRoute/ProtectedRoute'
import { CustomCursor } from '../shared/ui/CustomCursor/CustomCursor'
import { AuthCallbackPage } from '../pages/AuthCallbackPage/AuthCallbackPage'
import { LoginPage } from '../pages/LoginPage/LoginPage'
import { useTouchInputMode } from './hooks/useTouchInputMode'

const DashboardPage = lazy(() =>
  import('../pages/DashboardPage/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
)
const ExplainWordGamePage = lazy(() =>
  import('../pages/ExplainWordGamePage/ExplainWordGamePage').then((module) => ({
    default: module.ExplainWordGamePage,
  })),
)
const FriendProfilePage = lazy(() =>
  import('../pages/FriendProfilePage/FriendProfilePage').then((module) => ({
    default: module.FriendProfilePage,
  })),
)

export function App() {
  useTouchInputMode()

  return (
    <BrowserRouter>
      <CustomCursor />
      <AuthProvider>
        <Suspense fallback={<FullPageLoader label="Opening your meeting place…" />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route element={<ProtectedRoute />}>
              <Route index element={<DashboardPage />} />
              <Route path="profiles/:profileId" element={<FriendProfilePage />} />
              <Route path="games/explain-word/:partnershipId" element={<ExplainWordGamePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
