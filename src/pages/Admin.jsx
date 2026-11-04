import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Brand from '../components/Brand'
import DashboardPanel from '../components/admin/DashboardPanel'
import GuestsPanel from '../components/admin/GuestsPanel'
import ImportExportPanel from '../components/admin/ImportExportPanel'
import ReportsPanel from '../components/admin/ReportsPanel'
import StaffPanel from '../components/admin/StaffPanel'

const PANELS = [
  ['overview', 'Overview'],
  ['guests', 'Guests'],
  ['import-export', 'Import / Export'],
  ['staff', 'Staff'],
  ['reports', 'Reports'],
]

export default function Admin() {
  const { profile, signOut } = useAuth()
  const [panel, setPanel] = useState('overview')
  const content = {
    overview: <DashboardPanel />,
    guests: <GuestsPanel />,
    'import-export': <ImportExportPanel />,
    staff: <StaffPanel />,
    reports: <ReportsPanel />,
  }[panel]

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <Brand subtitle="Administrator dashboard" />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-deepnavy px-4 py-3">
          <p className="text-sm text-white/70">Signed in as <span className="text-gold">{profile.full_name}</span></p>
          <div className="flex gap-2"><Link to="/check-in" className="btn-ghost">Check-in</Link><button type="button" className="btn-ghost" onClick={signOut}>Sign out</button></div>
        </div>
      </header>

      <nav className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label="Administrator sections">
        {PANELS.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={`shrink-0 rounded-lg px-4 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${panel === id ? 'bg-gold font-semibold text-midnight' : 'border border-white/15 text-white/75 hover:bg-white/5'}`}
            aria-current={panel === id ? 'page' : undefined}
            onClick={() => setPanel(id)}
          >{label}</button>
        ))}
      </nav>

      <div className="mt-5 rounded-2xl border border-white/10 bg-midnight p-4 sm:p-6">
        {content}
      </div>
    </main>
  )
}
