import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const EMPTY_STATS = {
  invited_people: 0,
  checked_in_people: 0,
  remaining_people: 0,
  active_guest_records: 0,
  active_staff_accounts: 0,
  attendance_percent: 0,
  registered_attendees: 0,
  unregistered_capacity: 0,
  registration_percent: 0,
}

export default function DashboardPanel() {
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [registrationNotice, setRegistrationNotice] = useState('')
  const [activity, setActivity] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setRegistrationNotice('')
    try {
      const legacy = await supabase.rpc('admin_dashboard_stats')
      if (legacy.error) throw legacy.error
      const legacyRow = Array.isArray(legacy.data) ? legacy.data[0] : legacy.data
      if (!legacyRow) throw new Error('Empty dashboard results')
      setStats(legacyRow)
      try {
        const [registration, recent] = await Promise.all([
          supabase.rpc('admin_registration_stats'),
          supabase.rpc('admin_recent_attendance', { p_limit: 10 }),
        ])
        if (registration.error?.code === 'PGRST202' || recent.error?.code === 'PGRST202') {
          setRegistrationNotice('Registration metrics and activity require Supabase migration 0006. Existing dashboard totals remain available.')
          setActivity([])
          return
        }
        if (registration.error) throw registration.error
        if (recent.error) throw recent.error
        const registrationRow = Array.isArray(registration.data) ? registration.data[0] : registration.data
        if (!registrationRow) throw new Error('Empty registration dashboard results')
        setStats({ ...legacyRow, ...registrationRow })
        setActivity(recent.data || [])
      } catch {
        setRegistrationNotice('Registration metrics and recent activity could not be loaded. Existing dashboard totals remain available.')
        setActivity([])
      }
    } catch {
      setError('Dashboard data could not be loaded. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const cards = [
    ['Invited people', stats.invited_people],
    ['People checked in', stats.checked_in_people],
    ['People remaining', stats.remaining_people],
    ['Attendance', `${Number(stats.attendance_percent || 0).toFixed(1)}%`],
    ['Active guest records', stats.active_guest_records],
    ['Active staff accounts', stats.active_staff_accounts],
  ]
  const registrationCards = [
    ['Registered attendees', stats.registered_attendees],
    ['Unregistered invitation capacity', stats.unregistered_capacity],
    ['Registration completion', `${Number(stats.registration_percent || 0).toFixed(1)}%`],
  ]

  return (
    <section aria-labelledby="admin-dashboard-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="admin-dashboard-heading" className="font-serif text-2xl text-beige">Event overview</h2>
          <p className="mt-1 text-sm text-white/55">Live totals from the guest register</p>
        </div>
        <button type="button" className="btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm" role="alert">{error}</p>}
      {registrationNotice && <p className="mt-4 rounded-lg border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm text-yellow-100" role="status">{registrationNotice}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[...cards, ...(!registrationNotice ? registrationCards : [])].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-white/10 bg-deepnavy p-4">
            <p className="text-sm text-white/55">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-beige">
              {loading ? '—' : Number.isFinite(Number(value)) ? Number(value).toLocaleString() : value}
            </p>
          </article>
        ))}
      </div>
      {!loading && !error && stats.active_guest_records === 0 && (
        <p className="mt-5 rounded-lg border border-white/10 p-4 text-sm text-white/60">No active guest records yet. Add guests or import a CSV to begin.</p>
      )}
      {!loading && !error && !registrationNotice && (
        <section className="mt-7">
          <h3 className="font-serif text-xl text-beige">Recent check-in activity</h3>
          {activity.length ? (
            <ul className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
              {activity.map((row, index) => (
                <li key={`${row.checked_in_at}-${index}`} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                  <span className="text-white/80">{row.attendee_name || `${row.household_name || 'Invitation'} · legacy check-in`}</span>
                  <span className="text-white/45">{row.staff_name} · {new Date(row.checked_in_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-white/50">No check-ins recorded yet.</p>}
        </section>
      )}
    </section>
  )
}
