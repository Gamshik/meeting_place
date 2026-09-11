import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { FullPageLoader } from '../auth/ProtectedRoute'

export function AuthCallbackPage() {
  const { isLoading, session } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading) {
      navigate(session ? '/' : '/login', { replace: true })
    }
  }, [isLoading, navigate, session])

  return <FullPageLoader label="Finishing your sign-in…" />
}
