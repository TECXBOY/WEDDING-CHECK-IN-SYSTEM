import { useCallback, useEffect, useState } from 'react'
import { ADMIN_PAGE_SIZE, attendancePercentage, attendanceStatus } from '../../lib/adminData'
import { supabase } from '../../lib/supabase'

const GUEST_FILTERS = [
  ['all', 'All guests'],
  ['none', 'Not checked in'],
  ['partial', 'Partially checked in'],
  ['complete', 'Fully checked in'],
]

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export default function ReportsPanel() {
  const [stats, setStats] = useState(null)
  const [filter, setFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState('active')
  const [guestPage, setGuestPage] = useState(0)
  const [guests, setGuests] = useState([])
  const [guestTotal, setGuestTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(0)
  const [history, setHistory] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [statsResponse, guestsResponse] = await Promise.all([
        supabase.rpc('admin_dashboard_stats'),
        supabase.rpc('admin_list_guests', {
          p_query: '',
          p_active: activeFilter,
          p_attendance: filter,
          p_offset: guestPage * ADMIN_PAGE_SIZE,
          p_limit: ADMIN_PAGE_SIZE,
        }),
      ])
      if (statsResponse.error || guestsResponse.error) throw statsResponse.error || guestsResponse.error
      setStats(Array.isArray(statsResponse.data) ? statsResponse.data[0] : statsResponse.data)
      setGuests(guestsResponse.data || [])
      setGuestTotal(Number(guestsResponse.data?.[0]?.total_rows || 0))
    } catch {
      setError('Attendance report could not be loaded. Check the connection and retry.')
      setStats(null)
      setGuests([])
      setGuestTotal(0)
    } finally {
      setLoading(false)
    }
  }, [activeFilter, filter, guestPage])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const { data, error: responseError } = await supabase.rpc('admin_list_checkin_history', {
        p_offset: historyPage * ADMIN_PAGE_SIZE,
        p_limit: ADMIN_PAGE_SIZE,
      })
      if (responseError) throw responseError
      setHistory(data || [])
      setHistoryTotal(Number(data?.[0]?.total_rows || 0))
    } catch {
      setError('Check-in history could not be loaded. Check the connection and retry.')
      setHistory([])
      setHistoryTotal(0)
    } finally {
      setHistoryLoading(false)
    }
  }, [historyPage])

  useEffect(() => { loadReport() }, [loadReport])
  useEffect(() => { loadHistory() }, [loadHistory])

  const percent = stats
    ? attendancePercentage(stats.checked_in_people, stats.invited_people)
    : 0

  return (
    <section aria-labelledby="reports-heading">
      <div className="flex items-center justify-between gap-3">
        <div><h2 id="reports-heading" className="font-serif text-2xl text-beige">Attendance reports</h2><p className="mt-1 text-sm text-white/55">People counts and server-recorded check-in events</p></div>
        <button type="button" className="btn-ghost" disabled={loading || historyLoading} onClick={() => { loadReport(); loadHistory() }}>Refresh</button>
      </div>
      {error && <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm" role="alert">{error} <button type="button" className="underline" onClick={() => { loadReport(); loadHistory() }}>Retry</button></p>}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Invited people', stats?.invited_people],
          ['Checked in', stats?.checked_in_people],
          ['Remaining', stats?.remaining_people],
          ['Attendance', `${percent.toFixed(1)}%`],
        ].map(([label, value]) => <article key={label} className="rounded-xl border border-white/10 bg-deepnavy p-4"><p className="text-sm text-white/55">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-beige">{loading || value === undefined ? '—' : typeof value === 'number' ? value.toLocaleString() : value}</p></article>)}
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-serif text-xl text-beige">Guest attendance</h3>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs text-white/55">Attendance
            <select className="field mt-1 min-w-40" value={filter} onChange={(e) => { setGuestPage(0); setFilter(e.target.value) }}>{GUEST_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label className="text-xs text-white/55">Records
            <select className="field mt-1 min-w-32" value={activeFilter} onChange={(e) => { setGuestPage(0); setActiveFilter(e.target.value) }}><option value="active">Active</option><option value="all">All</option><option value="inactive">Inactive</option></select>
          </label>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-white/5 text-xs uppercase text-white/55"><tr><th className="px-4 py-3">Guest / household</th><th className="px-4 py-3">Invited</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Remaining</th><th className="px-4 py-3">Attendance</th><th className="px-4 py-3">Record</th></tr></thead>
          <tbody className="divide-y divide-white/10">
            {loading && <tr><td colSpan="6" className="px-4 py-7 text-center text-white/55">Loading report…</td></tr>}
            {!loading && guests.map((guest) => <tr key={guest.id}><td className="px-4 py-3">{guest.full_name}{guest.household_name && <span className="block text-xs text-white/50">{guest.household_name}</span>}</td><td className="px-4 py-3">{guest.invited_count}</td><td className="px-4 py-3">{guest.checked_in_count}</td><td className="px-4 py-3">{guest.invited_count - guest.checked_in_count}</td><td className="px-4 py-3">{attendanceStatus(guest)}</td><td className="px-4 py-3">{guest.is_active ? 'Active' : 'Inactive'}</td></tr>)}
            {!loading && !guests.length && <tr><td colSpan="6" className="px-4 py-7 text-center text-white/55">No guest records match this report.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-white/60"><span>{guestTotal.toLocaleString()} matching records · page {guestPage + 1}</span><div className="flex gap-2"><button type="button" className="btn-ghost" disabled={!guestPage || loading} onClick={() => setGuestPage((value) => value - 1)}>Previous</button><button type="button" className="btn-ghost" disabled={(guestPage + 1) * ADMIN_PAGE_SIZE >= guestTotal || loading} onClick={() => setGuestPage((value) => value + 1)}>Next</button></div></div>

      <h3 className="mt-9 font-serif text-xl text-beige">Check-in history</h3>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-white/5 text-xs uppercase text-white/55"><tr><th className="px-4 py-3">Guest / household</th><th className="px-4 py-3">Admitted</th><th className="px-4 py-3">Staff member</th><th className="px-4 py-3">Server timestamp</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Reversed by</th></tr></thead>
          <tbody className="divide-y divide-white/10">
            {historyLoading && <tr><td colSpan="6" className="px-4 py-7 text-center text-white/55">Loading check-in history…</td></tr>}
            {!historyLoading && history.map((entry) => <tr key={entry.id}><td className="px-4 py-3">{entry.guest_name || `Guest record unavailable (${entry.guest_id})`}{entry.household_name && <span className="block text-xs text-white/50">{entry.household_name}</span>}</td><td className="px-4 py-3">{entry.people_admitted}</td><td className="px-4 py-3">{entry.usher_name || 'Staff record unavailable'}</td><td className="px-4 py-3">{formatTime(entry.checked_in_at)}</td><td className="px-4 py-3">{entry.reversed_at ? `Reversed ${formatTime(entry.reversed_at)}` : 'Recorded'}</td><td className="px-4 py-3">{entry.reversed_at ? entry.reversed_by_name || 'Staff record unavailable' : '—'}</td></tr>)}
            {!historyLoading && !history.length && <tr><td colSpan="6" className="px-4 py-7 text-center text-white/55">No check-in events recorded.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-white/60"><span>{historyTotal.toLocaleString()} events · page {historyPage + 1}</span><div className="flex gap-2"><button type="button" className="btn-ghost" disabled={!historyPage || historyLoading} onClick={() => setHistoryPage((value) => value - 1)}>Previous</button><button type="button" className="btn-ghost" disabled={(historyPage + 1) * ADMIN_PAGE_SIZE >= historyTotal || historyLoading} onClick={() => setHistoryPage((value) => value + 1)}>Next</button></div></div>
    </section>
  )
}
