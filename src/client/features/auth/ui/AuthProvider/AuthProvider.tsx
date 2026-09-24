import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { supabase } from '@shared/api/supabase'
import { AuthContext, type AuthContextValue } from '@features/auth/model/AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
        setIsLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      isLoading,
      session,
      signInWithGoogle: async () => {
        setError(null)
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        })

        if (error) throw error
      },
      signOut: async () => {
        setError(null)
        try {
          const { error } = await supabase.auth.signOut()
          if (error) throw error
        } catch (signOutError) {
          // The SDK may clear the local session before returning a server error.
          // Keep the message in the provider so it survives navigation to login.
          setError(
            signOutError instanceof Error
              ? signOutError.message
              : 'We could not complete sign-out.',
          )
          throw signOutError
        }
      },
    }),
    [error, isLoading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
