import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@features/auth/model/AuthContext'
import { FullPageLoader } from '@shared/ui/FullPageLoader/FullPageLoader'
import { hasPendingTerms, forgetTerms } from '@features/auth/lib/pending-terms'
import { TERMS_VERSION } from '@contracts/legal'
import { api } from '@shared/api/api'

export function AuthCallbackPage() {
  const { isLoading, session, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (isLoading) return
    if (!session) {
      forgetTerms()
      navigate('/login', { replace: true })
      return
    }
    let active = true
    async function finish() {
      try {
        if (hasPendingTerms()) {
          await api.acceptTerms({ adult: true, acceptTerms: true, termsVersion: TERMS_VERSION })
          if (!active) return
          forgetTerms()
        }
        if (active) navigate('/', { replace: true })
      } catch {
        if (active) setError(true)
      }
    }
    void finish()
    return () => {
      active = false
    }
  }, [isLoading, navigate, session, retry])
  if (error)
    return (
      <main className="legal-page">
        <section className="legal-card">
          <h1>Could not save your confirmation</h1>
          <p role="alert">
            Your sign-in succeeded, but your age and Terms confirmation could not be saved. Try
            again to continue.
          </p>
          <button
            className="button button-primary"
            onClick={() => {
              setError(false)
              setRetry((value) => value + 1)
            }}
          >
            Try again
          </button>
          <button
            className="button button-secondary"
            onClick={() => {
              forgetTerms()
              void signOut().catch(() => setError(true))
            }}
          >
            Sign out
          </button>
        </section>
      </main>
    )
  return <FullPageLoader label="Finishing your sign-in…" />
}
