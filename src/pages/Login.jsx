import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { isConfigured } from '../lib/supabase'
import Brand from '../components/Brand'
import Splash from '../components/Splash'

export default function Login() {
  const { session, profile, loading, authError, clearAuthError, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <Splash />
  if (session && profile) return <Navigate to={location.state?.from || '/check-in'} replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    clearAuthError()
    setBusy(true)
    const { error: err } = await signIn(email, password)
    if (err) setError(err)
    setBusy(false)
  }

  const message = error || authError

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <Brand size="lg" />
      <p className="mt-3 text-center font-serif text-lg text-beige">
        Ing. Alhaji Alpha Sallui Koita &amp; Ing. Fatmata Kargbo
      </p>
      <div className="mx-auto my-8 h-px w-16 bg-gold/60" />
      <h2 className="mb-5 text-center text-xs uppercase tracking-[0.25em] text-white/60">Staff sign-in</h2>

      {!isConfigured && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">
          Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm text-white/70">Email</label>
          <input
            id="email" type="email" inputMode="email" autoComplete="username"
            autoCapitalize="none" autoCorrect="off" required
            className="field" value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm text-white/70">Password</label>
          <input
            id="password" type="password" autoComplete="current-password" required
            className="field" value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {message && (
          <p role="alert" className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-white">
            {message}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-white/40">
        Access is limited to staff accounts created by the administrator.
      </p>
    </main>
  )
}
