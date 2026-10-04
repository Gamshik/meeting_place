import { FullPageLoader } from '@shared/ui/FullPageLoader/FullPageLoader'
import { useEffect, useState, type ReactNode } from 'react'
import { TermsFields } from '@features/auth/ui/TermsFields/TermsFields'
import { TERMS_VERSION } from '@contracts/legal'
import { api } from '@shared/api/api'
import { useAuth } from '@features/auth/model/AuthContext'
import { LegalLinks } from '@pages/LegalPage/LegalPage'

export function LegalGate({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const [accepted, setAccepted] = useState<boolean | null>(null)
  const [adult, setAdult] = useState(false)
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    api
      .getLegalStatus()
      .then(({ data }) => {
        if (active) setAccepted(data.accepted)
      })
      .catch(() => {
        if (active) setError('Could not check your account confirmation. Reload to try again.')
      })
    return () => {
      active = false
    }
  }, [])
  async function accept() {
    if (!adult || !terms || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.acceptTerms({ adult: true, acceptTerms: true, termsVersion: TERMS_VERSION })
      setAccepted(true)
    } catch {
      setError('Could not save your confirmation. Try again.')
    } finally {
      setBusy(false)
    }
  }
  if (accepted) return children
  if (accepted === null) {
    if (!error) return <FullPageLoader label="Opening your meeting place…" />
    return (
      <main className="legal-page">
        <section className="legal-card">
          <h1>Could not open your meeting place</h1>
          <p role="alert">{error}</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Try again
          </button>
          <button
            className="button button-secondary"
            onClick={() => void signOut().catch(() => setError('Could not sign out. Try again.'))}
          >
            Sign out
          </button>
          <LegalLinks />
        </section>
      </main>
    )
  }
  return (
    <main className="legal-page">
      <section className="legal-card">
        <h1>Before you practice</h1>
        <>
          <TermsFields adult={adult} terms={terms} onAdult={setAdult} onTerms={setTerms} />
          <button
            className="button button-primary"
            disabled={!adult || !terms || busy}
            onClick={() => void accept()}
          >
            {busy ? 'Saving…' : 'Confirm and continue'}
          </button>
        </>
        {error ? <p role="alert">{error}</p> : null}
        <button
          className="button button-secondary"
          onClick={() => void signOut().catch(() => setError('Could not sign out. Try again.'))}
        >
          Sign out
        </button>
        <LegalLinks />
      </section>
    </main>
  )
}
