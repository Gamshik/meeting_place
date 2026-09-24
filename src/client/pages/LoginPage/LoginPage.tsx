import { useState } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '@features/auth/model/AuthContext'
import { FullPageLoader } from '@features/auth/ui/ProtectedRoute/ProtectedRoute'

export function LoginPage() {
  const { isLoading, session, signInWithGoogle, error: authError } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  if (isLoading) {
    return <FullPageLoader label="Checking your session…" />
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  async function handleSignIn() {
    setError(null)
    setIsSigningIn(true)

    try {
      await signInWithGoogle()
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Google sign-in failed.')
      setIsSigningIn(false)
    }
  }

  return (
    <main className="login-page">
      <header className="login-header">
        <a className="wordmark" href="/">
          <span className="brand-mark" aria-hidden="true">
            mp
          </span>
          <span>
            meeting
            <span className="brand-dot" aria-hidden="true" />
            <br />
            place
          </span>
        </a>
        <span>Less scrolling. More speaking.</span>
      </header>
      <section className="login-hero">
        <div className="login-copy">
          <h1>
            Speak before
            <br />
            you overthink.
          </h1>
          <button
            className="button button-primary google-button"
            type="button"
            onClick={handleSignIn}
            disabled={isSigningIn}
          >
            <GoogleMark />
            {isSigningIn ? 'Opening Google…' : 'Start practicing with Google'}
          </button>
          <div className="login-promises" aria-label="What to expect">
            <span>
              <i aria-hidden="true">↔</i>2 players
            </span>
            <span>
              <i aria-hidden="true">◷</i>5–10 minutes
            </span>
            <span>
              <i aria-hidden="true">✓</i>No setup
            </span>
          </div>
          {error || authError ? (
            <p role="alert" className="login-error">
              {error ?? authError}
            </p>
          ) : null}
        </div>
        <div className="login-art">
          <LoginPracticeArtwork />
        </div>
      </section>
    </main>
  )
}

function LoginPracticeArtwork() {
  return (
    <div className="login-practice-art" aria-hidden="true">
      <div className="login-orbit-ring" />
      <div className="login-person login-person-left">
        <span>A</span>
        <i />
      </div>
      <div className="login-person login-person-right">
        <span>B</span>
        <i />
      </div>
      <div className="login-practice-core">
        <small>Practice English</small>
        <strong>Together</strong>
        <div className="login-waveform">
          {[18, 34, 52, 30, 64, 44, 24].map((height, index) => (
            <i key={index} style={{ height }} />
          ))}
        </div>
      </div>
      <span className="login-speak-bubble">Speak</span>
      <span className="login-listen-bubble">Listen</span>
      <span className="login-orbit-arrow login-orbit-arrow-top">↗</span>
      <span className="login-orbit-arrow login-orbit-arrow-bottom">↙</span>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.93A6.02 6.02 0 0 1 6.07 12c0-.67.11-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.62.39 3.15 1.04 4.55l3.35-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
      />
    </svg>
  )
}
