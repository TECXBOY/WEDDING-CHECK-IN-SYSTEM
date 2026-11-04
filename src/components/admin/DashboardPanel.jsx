import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const EMPTY_STATS = {
  invited_people: 0,
  checked_in_people: 0,
  remaining_people: 0,
  active_guest_records: 0,
  active_staff_accounts: 0,
  attendance_percent: 0,
}

export default function DashboardPanel() {
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: responseError } = await supabase.rpc('admin_dashboard_stats')
      if (responseError) throw responseError
      const row = Array.isArray(data) ? data[0] : data
      if (!row) throw new Error('Empty dashboard results')
      setStats(row)
    } catch {
      setError('Dashboard totals could not be loaded. Check your connection and retry.')
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
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map(([label, value]) => (
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
    </section>
  )
}
