import { useCallback, useEffect, useState } from 'react'
import { attendanceStatus, ADMIN_PAGE_SIZE } from '../../lib/adminData'
import { normalizeRegistrationPhone } from '../../lib/registration'
import { supabase } from '../../lib/supabase'

const EMPTY_FORM = { full_name: '', household_name: '', phone_number: '', invited_count: '1', notes: '' }

function GuestForm({ guest, onClose, onSaved }) {
  const [form, setForm] = useState(guest ? {
    full_name: guest.full_name,
    household_name: guest.household_name || '',
    phone_number: '',
    invited_count: String(guest.invited_count),
    notes: guest.notes || '',
  } : EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingPhone, setLoadingPhone] = useState(Boolean(guest))
  const [phoneLoadFailed, setPhoneLoadFailed] = useState(false)

  useEffect(() => {
    if (!guest) return undefined
    let active = true
    supabase.rpc('admin_get_guest_registration_phone', { p_guest_id: guest.id })
      .then(({ data, error: responseError }) => {
        if (!active) return
        if (responseError) throw responseError
        setForm((current) => ({ ...current, phone_number: data || '' }))
        setError('')
        setLoadingPhone(false)
      })
      .catch(() => {
        if (!active) return
        setError('Guest phone number could not be loaded. Confirm migration 0008 is applied.')
        setPhoneLoadFailed(true)
        setLoadingPhone(false)
      })
    return () => { active = false }
  }, [guest?.id])

  async function submit(event) {
    event.preventDefault()
    const invited = Number(form.invited_count)
    if (!form.full_name.trim() || form.full_name.trim().length > 200) {
      setError('Enter a guest name up to 200 characters.')
      return
    }
    if (!Number.isSafeInteger(invited) || invited < 1 || invited > 2147483647) {
      setError('Invited count must be a positive whole number.')
      return
    }
    if (form.household_name.trim().length > 200 || form.notes.length > 1000) {
      setError('Household names are limited to 200 characters and notes to 1000.')
      return
    }
    const phoneNumber = normalizeRegistrationPhone(form.phone_number)
    if (form.phone_number.trim() && !phoneNumber) {
      setError('Enter a valid phone number or leave the field blank.')
      return
    }
    if (guest && invited < guest.checked_in_count) {
      setError(`Invited count cannot be less than the ${guest.checked_in_count} people already checked in.`)
      return
    }

    setSaving(true)
    setError('')
    const values = {
      full_name: form.full_name.trim(),
      household_name: form.household_name.trim() || null,
      phone_number: phoneNumber || null,
      normalized_phone: phoneNumber || null,
      invited_count: invited,
      notes: form.notes.trim() || null,
    }
    try {
      const response = guest
        ? await supabase.from('guests').update(values).eq('id', guest.id).select('id').maybeSingle()
        : await supabase.rpc('admin_create_guest', {
          p_full_name: values.full_name,
          p_household_name: values.household_name,
          p_invited_count: values.invited_count,
          p_notes: values.notes,
        })
      if (!response.error && guest && !response.data) {
        setError('Guest could not be found. Refresh the list and try again.')
        return
      }
      if (response.error) {
        setError(response.error.code === '23514'
          ? 'Invited count cannot be less than the number already checked in.'
          : response.error.code === '23505'
            ? 'A guest with this name and household already exists.'
            : 'Guest could not be saved. Check the values and try again.')
        return
      }
      if (!guest && phoneNumber) {
        const { data, error: phoneError } = await supabase
          .from('guests')
          .update({ phone_number: phoneNumber, normalized_phone: phoneNumber })
          .eq('id', response.data)
          .select('id')
          .maybeSingle()
        if (phoneError || !data) {
          setError('Guest was created, but the phone number could not be saved. Edit the guest and retry.')
          return
        }
      }
      await onSaved()
    } catch {
      setError('Guest could not be saved because the request failed. Check your connection and retry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="guest-form-title" className="w-full max-w-lg rounded-t-2xl border border-white/10 bg-midnight p-5 sm:rounded-2xl">
        <h3 id="guest-form-title" className="font-serif text-xl text-beige">{guest ? 'Edit guest' : 'Add guest'}</h3>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <label className="block text-sm text-white/70">Guest name
            <input autoFocus className="field mt-1" maxLength="200" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </label>
          <label className="block text-sm text-white/70">Household or group name
            <input className="field mt-1" maxLength="200" value={form.household_name} onChange={(e) => setForm({ ...form, household_name: e.target.value })} />
          </label>
          <label className="block text-sm text-white/70">Registration phone number
            <input className="field mt-1" type="tel" inputMode="tel" placeholder="e.g. 0761234567 or +232761234567" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
          </label>
          <label className="block text-sm text-white/70">People invited
            <input className="field mt-1" type="number" min="1" step="1" value={form.invited_count} onChange={(e) => setForm({ ...form, invited_count: e.target.value })} required />
          </label>
          <label className="block text-sm text-white/70">Notes
            <textarea className="field mt-1" rows="3" maxLength="1000" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          {error && <p className="text-sm text-red-200" role="alert">{error}</p>}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || loadingPhone || phoneLoadFailed}>{saving || loadingPhone ? 'Loading…' : 'Save guest'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function GuestsPanel() {
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('active')
  const [attendanceFilter, setAttendanceFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [guests, setGuests] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: responseError } = await supabase.rpc('admin_list_guests', {
        p_query: query.trim(),
        p_active: activeFilter,
        p_attendance: attendanceFilter,
        p_offset: page * ADMIN_PAGE_SIZE,
        p_limit: ADMIN_PAGE_SIZE,
      })
      if (responseError) throw responseError
      setGuests(data || [])
      setTotal(Number(data?.[0]?.total_rows || 0))
    } catch {
      setError('Guest records could not be loaded. Check your connection and retry.')
      setGuests([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [query, activeFilter, attendanceFilter, page])

  useEffect(() => { load() }, [load])

  async function deactivate(guest) {
    if (!window.confirm(`Deactivate ${guest.full_name}? Check-in history will be preserved.`)) return
    setBusyId(guest.id)
    setFeedback('')
    try {
      const { data, error: updateError } = await supabase
        .from('guests')
        .update({ is_active: false })
        .eq('id', guest.id)
        .select('id')
        .maybeSingle()
      if (updateError || !data) setFeedback('Guest could not be deactivated. Retry or check the database connection.')
      else {
        setFeedback('Guest deactivated. Historical check-ins remain available.')
        await load()
      }
    } catch {
      setFeedback('Guest could not be deactivated because the request failed. Check your connection and retry.')
    } finally {
      setBusyId('')
    }
  }

  async function saved() {
    setEditing(null)
    setFeedback('Guest record saved.')
    await load()
  }

  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))

  return (
    <section aria-labelledby="guests-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="guests-heading" className="font-serif text-2xl text-beige">Guest register</h2>
          <p className="mt-1 text-sm text-white/55">{total.toLocaleString()} matching records</p>
        </div>
        <button type="button" className="btn-primary w-auto" onClick={() => setEditing({})}>Add guest</button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-white/60 sm:col-span-1">Search
          <input className="field mt-1" placeholder="Guest or household" value={query} onChange={(e) => { setPage(0); setQuery(e.target.value) }} />
        </label>
        <label className="text-xs text-white/60">Record status
          <select className="field mt-1" value={activeFilter} onChange={(e) => { setPage(0); setActiveFilter(e.target.value) }}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All records</option>
          </select>
        </label>
        <label className="text-xs text-white/60">Attendance
          <select className="field mt-1" value={attendanceFilter} onChange={(e) => { setPage(0); setAttendanceFilter(e.target.value) }}>
            <option value="all">All attendance</option><option value="none">Not checked in</option><option value="partial">Partially checked in</option><option value="complete">Fully checked in</option>
          </select>
        </label>
      </div>
      {feedback && <p className="mt-4 rounded-lg border border-white/10 p-3 text-sm" role="status">{feedback}</p>}
      {error && <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm" role="alert">{error} <button type="button" className="underline" onClick={load}>Retry</button></p>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/55"><tr>
            <th className="px-4 py-3">Guest / household</th><th className="px-4 py-3">Invited</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Remaining</th><th className="px-4 py-3">Attendance</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-white/10">
            {loading && <tr><td colSpan="7" className="px-4 py-8 text-center text-white/55">Loading guest records…</td></tr>}
            {!loading && !error && guests.map((guest) => (
              <tr key={guest.id}>
                <td className="px-4 py-3"><span className="block font-medium">{guest.full_name}</span>{guest.household_name && <span className="text-xs text-white/50">{guest.household_name}</span>}{guest.notes && <span className="block max-w-48 truncate text-xs text-white/40" title={guest.notes}>{guest.notes}</span>}</td>
                <td className="px-4 py-3 tabular-nums">{guest.invited_count}</td><td className="px-4 py-3 tabular-nums">{guest.checked_in_count}</td><td className="px-4 py-3 tabular-nums">{guest.invited_count - guest.checked_in_count}</td>
                <td className="px-4 py-3">{attendanceStatus(guest)}</td><td className="px-4 py-3">{guest.is_active ? 'Active' : 'Inactive'}</td>
                <td className="px-4 py-3"><div className="flex gap-2"><button type="button" className="text-gold underline underline-offset-2" onClick={() => setEditing(guest)}>Edit</button>{guest.is_active && <button type="button" className="text-red-200 underline underline-offset-2 disabled:opacity-50" disabled={busyId === guest.id} onClick={() => deactivate(guest)}>{busyId === guest.id ? 'Saving…' : 'Deactivate'}</button>}</div></td>
              </tr>
            ))}
            {!loading && !error && guests.length === 0 && <tr><td colSpan="7" className="px-4 py-8 text-center text-white/55">No guest records match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-white/60">
        <span>Page {page + 1} of {pageCount}</span>
        <div className="flex gap-2"><button type="button" className="btn-ghost" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" className="btn-ghost" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div>
      </div>
      {editing && <GuestForm guest={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={saved} />}
    </section>
  )
}
