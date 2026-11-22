import { lazy, Suspense } from 'react'
import { BrowserRouter, useLocation, useMatch } from 'react-router-dom'

import { demoHomeState } from '@features/demo/demo-navigation'
import { CustomCursor } from '@shared/ui/CustomCursor/CustomCursor'
import { FullPageLoader } from '@shared/ui/FullPageLoader/FullPageLoader'
import { useTouchInputMode } from './hooks/useTouchInputMode'

const SiteRoutes = lazy(() => import('./SiteRoutes'))
const DemoPage = lazy(() => import('@features/demo/DemoPage'))

function AppRoutes() {
  const { pathname, state } = useLocation()
  const demoRoute = useMatch('/demo/*')
  const demoHome = pathname === '/' && state?.demo === demoHomeState.demo

  return demoRoute || demoHome ? <DemoPage /> : <SiteRoutes />
}

export function App() {
  useTouchInputMode()

  return (
    <BrowserRouter>
      <CustomCursor />
      <Suspense fallback={<FullPageLoader label="Opening your meeting place…" />}>
        <AppRoutes />
      </Suspense>
    </BrowserRouter>
  )
}
