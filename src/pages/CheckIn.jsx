import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Brand from '../components/Brand'

// Stage 1 placeholder — the real search / verification / check-in flow is built in Stage 2.
export default function CheckIn() {
  const { profile, isAdmin, signOut } = useAuth()
  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <Brand subtitle="Wedding Guest Check-In" />
      <p className="mt-1 text-center text-sm text-white/50">Sunday, 13 December 2026</p>
      <div className="mt-8 rounded-xl border border-white/10 bg-deepnavy p-5 text-sm">
        <p>
          Signed in as <span className="text-gold">{profile.full_name}</span> ({profile.role}).
        </p>
        <p className="mt-2 text-white/60">Guest search and check-in arrive in Stage 2.</p>
      </div>
      <div className="mt-4 flex gap-3">
        {isAdmin && <Link to="/admin" className="btn-ghost">Admin</Link>}
        <button onClick={signOut} className="btn-ghost">Sign out</button>
      </div>
    </main>
  )
}
