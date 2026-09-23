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

function useTouchInputMode() {
  useEffect(() => {
    const touchInput = window.matchMedia('(hover: none), (pointer: coarse)')
    const pressStartTimeouts = new Map<HTMLElement, number>()
    const pressAnimations = new Map<HTMLElement, Animation>()
    const selector = 'button, a, summary, label, [role="button"], .future-game, .rules-steps li'
    let tapCandidate: {
      control: HTMLElement
      pointerId: number
      startX: number
      startY: number
    } | null = null

    const clearPressFeedback = () => {
      pressStartTimeouts.forEach((timeout) => window.clearTimeout(timeout))
      pressStartTimeouts.clear()
      pressAnimations.forEach((animation) => animation.cancel())
      pressAnimations.clear()
    }
    const syncInputMode = () => {
      document.documentElement.classList.toggle('touch-input', touchInput.matches)
      if (!touchInput.matches) clearPressFeedback()
    }
    const startTap = (event: PointerEvent) => {
      if (!touchInput.matches || event.pointerType === 'mouse') return
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest<HTMLElement>(selector)
      if (!control || control.matches(':disabled, [aria-disabled="true"]')) return

      tapCandidate = {
        control,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      }
    }
    const trackTap = (event: PointerEvent) => {
      if (!tapCandidate || tapCandidate.pointerId !== event.pointerId) return
      if (
        Math.hypot(event.clientX - tapCandidate.startX, event.clientY - tapCandidate.startY) > 10
      ) {
        tapCandidate = null
      }
    }
    const finishTap = (event: PointerEvent) => {
      if (!tapCandidate || tapCandidate.pointerId !== event.pointerId) return
      if (
        Math.hypot(event.clientX - tapCandidate.startX, event.clientY - tapCandidate.startY) > 10
      ) {
        tapCandidate = null
        return
      }
      const { control } = tapCandidate
      tapCandidate = null

      const previousStartTimeout = pressStartTimeouts.get(control)
      if (previousStartTimeout) window.clearTimeout(previousStartTimeout)
      const startTimeout = window.setTimeout(() => {
        pressStartTimeouts.delete(control)
        if (!control.isConnected) return

        pressAnimations.get(control)?.cancel()
        const animation = control.animate(
          [
            { translate: '0 0', easing: 'cubic-bezier(0.22, 0.75, 0.3, 1)' },
            {
              translate: '2px 2px',
              offset: 0.38,
              easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
            },
            { translate: '0 0' },
          ],
          { duration: 320, easing: 'linear' },
        )
        pressAnimations.set(control, animation)
        const clearAnimation = () => {
          if (pressAnimations.get(control) === animation) pressAnimations.delete(control)
        }
        animation.addEventListener('finish', clearAnimation, { once: true })
        animation.addEventListener('cancel', clearAnimation, { once: true })
      }, 0)
      pressStartTimeouts.set(control, startTimeout)
    }
    const cancelTap = () => {
      tapCandidate = null
    }

    syncInputMode()
    touchInput.addEventListener('change', syncInputMode)
    document.addEventListener('pointerdown', startTap, true)
    document.addEventListener('pointermove', trackTap, true)
    document.addEventListener('pointerup', finishTap, true)
    document.addEventListener('pointercancel', cancelTap, true)
    return () => {
      clearPressFeedback()
      touchInput.removeEventListener('change', syncInputMode)
      document.removeEventListener('pointerdown', startTap, true)
      document.removeEventListener('pointermove', trackTap, true)
      document.removeEventListener('pointerup', finishTap, true)
      document.removeEventListener('pointercancel', cancelTap, true)
      document.documentElement.classList.remove('touch-input')
    }
  }, [])
}
