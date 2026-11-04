import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute'
import Login from './pages/Login'
import CheckIn from './pages/CheckIn'
import Admin from './pages/Admin'
import Register from './pages/Register'
import AdmissionPass from './pages/AdmissionPass'
const Scanner = lazy(() => import('./pages/Scanner'))

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pass/:token" element={<AdmissionPass />} />

      {/* Any signed-in, active staff member */}
      <Route element={<ProtectedRoute />}>
        <Route path="/check-in" element={<CheckIn />} />
        <Route path="/scan" element={<Suspense fallback={<div className="p-8 text-center text-white/60">Loading scanner…</div>}><Scanner /></Suspense>} />
      </Route>

      {/* Administrators only */}
      <Route element={<ProtectedRoute requireAdmin />}>
        <Route path="/admin" element={<Admin />} />
      </Route>

      <Route path="*" element={<Navigate to="/check-in" replace />} />
    </Routes>
  )
}
