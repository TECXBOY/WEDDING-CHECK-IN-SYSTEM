import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Brand from '../components/Brand'

// Stage 1 placeholder — guest management, staff and reports are built in Stage 3.
export default function Admin() {
  const { profile, signOut } = useAuth()
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Brand subtitle="Administrator" />
      <div className="mt-8 rounded-xl border border-white/10 bg-deepnavy p-5 text-sm">
        <p>
          Signed in as <span className="text-gold">{profile.full_name}</span>.
        </p>
        <p className="mt-2 text-white/60">Guest management, staff accounts and reports arrive in Stage 3.</p>
      </div>
      <div className="mt-4 flex gap-3">
        <Link to="/check-in" className="btn-ghost">Check-in view</Link>
        <button onClick={signOut} className="btn-ghost">Sign out</button>
      </div>
    </main>
  )
}
