import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // 1. Track the Supabase session.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 2. Whenever the signed-in user changes, load their staff profile.
  //    (Done outside onAuthStateChange to avoid supabase-js deadlocks.)
  const userId = session?.user?.id
  useEffect(() => {
    if (session === undefined) return
    if (!userId) {
      setProfile(null)
      return
    }
    let cancelled = false
    setProfileLoading(true)
    supabase
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', userId)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (error) {
          setAuthError('Could not verify your staff account. Check your connection and try again.')
          await supabase.auth.signOut()
        } else if (!data) {
          setAuthError('This account is not registered as wedding staff.')
          await supabase.auth.signOut()
        } else if (!data.is_active) {
          setAuthError('This staff account has been disabled. Please contact the administrator.')
          await supabase.auth.signOut()
        } else {
          setProfile(data)
        }
        setProfileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session, userId])

  const signIn = useCallback(async (email, password) => {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      const offline = /fetch|network/i.test(error.message)
      return {
        error: offline
          ? 'Network error. Check your internet connection and try again.'
          : 'Incorrect email or password.',
      }
    }
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      profile,
      loading: session === undefined || (Boolean(userId) && profileLoading) || (Boolean(userId) && !profile && !authError),
      authError,
      clearAuthError: () => setAuthError(''),
      isAdmin: profile?.role === 'admin',
      signIn,
      signOut,
    }),
    [session, profile, profileLoading, userId, authError, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
