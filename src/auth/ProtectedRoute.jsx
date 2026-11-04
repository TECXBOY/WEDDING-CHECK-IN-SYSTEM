import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Splash from '../components/Splash'

// Gate for every staff page. UI-level only — the database enforces the real rules via RLS.
export default function ProtectedRoute({ requireAdmin = false }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Splash />
  if (!session || !profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (requireAdmin && profile.role !== 'admin') return <Navigate to="/check-in" replace />
  return <Outlet />
}
