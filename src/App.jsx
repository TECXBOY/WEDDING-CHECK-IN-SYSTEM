import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute'
import Login from './pages/Login'
import CheckIn from './pages/CheckIn'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Any signed-in, active staff member */}
      <Route element={<ProtectedRoute />}>
        <Route path="/check-in" element={<CheckIn />} />
      </Route>

      {/* Administrators only */}
      <Route element={<ProtectedRoute requireAdmin />}>
        <Route path="/admin" element={<Admin />} />
      </Route>

      <Route path="*" element={<Navigate to="/check-in" replace />} />
    </Routes>
  )
}
