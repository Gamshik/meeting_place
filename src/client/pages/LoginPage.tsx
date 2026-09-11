import { useState } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { FullPageLoader } from '../auth/ProtectedRoute'

export function LoginPage() {
  const { isLoading, session, signInWithGoogle } = useAuth()
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
    <main className="relative grid min-h-screen overflow-hidden bg-emerald-950 px-5 py-10 text-white lg:grid-cols-2 lg:px-12">
      <div className="absolute -left-28 top-16 size-80 rounded-full bg-emerald-700/30 blur-3xl" />
      <div className="absolute -bottom-24 right-10 size-96 rounded-full bg-amber-300/15 blur-3xl" />

      <section className="relative flex flex-col justify-between py-6 lg:py-12">
        <p className="font-serif text-xl font-semibold text-amber-300">Meeting Place</p>
        <div className="max-w-xl py-16 lg:py-0">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.25em] text-emerald-200">
            Learn together
          </p>
          <h1 className="font-serif text-5xl leading-[1.05] sm:text-6xl">
            Better English starts with one honest conversation.
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-emerald-100/80">
            Connect with a partner, practise regularly, and let technology handle the preparation.
          </p>
        </div>
        <p className="text-sm text-emerald-100/50">Built for learners, not classrooms.</p>
      </section>

      <section className="relative grid place-items-center lg:justify-items-end">
        <div className="w-full max-w-md rounded-[2rem] bg-stone-50 p-7 text-stone-900 shadow-2xl sm:p-10">
          <div className="mb-9">
            <p className="mb-2 text-sm font-medium text-emerald-800">Welcome</p>
            <h2 className="font-serif text-3xl font-semibold">Create your meeting place</h2>
            <p className="mt-3 leading-7 text-stone-600">
              One account, as many learning partners as you need.
            </p>
          </div>

          <button
            className="button flex w-full justify-center border border-stone-300 bg-white px-5 py-3.5 text-base shadow-sm hover:bg-stone-100"
            type="button"
            onClick={handleSignIn}
            disabled={isSigningIn}
          >
            <GoogleMark />
            {isSigningIn ? 'Opening Google…' : 'Continue with Google'}
          </button>

          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

          <p className="mt-7 text-center text-xs leading-5 text-stone-500">
            By continuing, you create an account if you do not already have one.
          </p>
        </div>
      </section>
    </main>
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
