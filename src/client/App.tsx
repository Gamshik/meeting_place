import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthProvider'
import { FullPageLoader, ProtectedRoute } from './auth/ProtectedRoute'
import { CustomCursor } from './components/CustomCursor'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { LoginPage } from './pages/LoginPage'

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
const ExplainWordGamePage = lazy(() =>
  import('./pages/ExplainWordGamePage').then((module) => ({
    default: module.ExplainWordGamePage,
  })),
)
const FriendProfilePage = lazy(() =>
  import('./pages/FriendProfilePage').then((module) => ({
    default: module.FriendProfilePage,
  })),
)

export function App() {
  useTouchPressState()

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

function useTouchPressState() {
  useEffect(() => {
    const controls = new Set<HTMLElement>()
    const selector = 'button, a, summary, [role="button"], .future-game, .rules-steps li'

    const release = () => {
      controls.forEach((control) => control.classList.remove('is-touch-pressed'))
      controls.clear()
    }
    const press = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        release()
        document.documentElement.classList.remove('touch-input')
        return
      }
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest<HTMLElement>(selector)
      if (!control || control.matches(':disabled, [aria-disabled="true"]')) return
      document.documentElement.classList.add('touch-input')
      release()
      control.classList.add('is-touch-pressed')
      controls.add(control)
    }

    document.addEventListener('pointerdown', press, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
    window.addEventListener('blur', release)
    return () => {
      release()
      document.documentElement.classList.remove('touch-input')
      document.removeEventListener('pointerdown', press, true)
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('pointercancel', release, true)
      window.removeEventListener('blur', release)
    }
  }, [])
}
