import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Brand from '../components/Brand'
import { normalizeSearchTerm, requestGuestCheckIn, validateAdmissionCount } from '../lib/checkin'
import { getCheckInErrorMessage } from '../lib/checkinErrors'
import { supabase } from '../lib/supabase'

const EMPTY_ATTENDANCE = { expected: 0, checkedIn: 0, remaining: 0 }

function getAttendance(row) {
  return {
    expected: Number(row.expected),
    checkedIn: Number(row.checked_in),
    remaining: Number(row.remaining),
  }
}

function formatTime(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString()
}

export default function CheckIn() {
  const { profile, isAdmin, signOut } = useAuth()
  const [attendance, setAttendance] = useState(EMPTY_ATTENDANCE)
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [attendanceError, setAttendanceError] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedGuest, setSelectedGuest] = useState(null)
  const [people, setPeople] = useState('1')
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [checkInError, setCheckInError] = useState('')
  const [success, setSuccess] = useState(null)
  const searchInput = useRef(null)

  const loadAttendance = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_attendance_stats')
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('Attendance totals were not returned.')
    setAttendance(getAttendance(row))
    setAttendanceError('')
  }, [])

  useEffect(() => {
    let active = true
    supabase.rpc('get_attendance_stats')
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setAttendanceError('Attendance totals could not be loaded.')
        } else {
          const row = Array.isArray(data) ? data[0] : data
          if (row) {
            setAttendance(getAttendance(row))
            setAttendanceError('')
          } else {
            setAttendanceError('Attendance totals could not be loaded.')
          }
        }
        setAttendanceLoading(false)
      })
      .catch(() => {
        if (!active) return
        setAttendanceError('Attendance totals could not be loaded.')
        setAttendanceLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const term = normalizeSearchTerm(query)
    let active = true

    if (!term) {
      setResults([])
      setSearched(false)
      setSearchError('')
      setSearching(false)
      return () => {
        active = false
      }
    }

    setSearching(true)
    setSearchError('')
    const timeout = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('search_guests', {
          p_query: term,
          p_limit: 20,
        })
        if (error) throw error
        if (!active) return
        setResults(data || [])
        setSearched(true)
      } catch {
        if (!active) return
        setResults([])
        setSearched(true)
        setSearchError('Guest search failed. Check your connection and try again.')
      } finally {
        if (active) setSearching(false)
      }
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [query])

  function chooseGuest(guest) {
    setSelectedGuest(guest)
    setPeople('1')
    setConfirming(false)
    setCheckInError('')
    setSuccess(null)
  }

  async function submitCheckIn() {
    const validationError = validateAdmissionCount(people, selectedGuest.invited_count - selectedGuest.checked_in_count)
    if (validationError) {
      setCheckInError(validationError)
      setConfirming(false)
      return
    }

    setSubmitting(true)
    setCheckInError('')
    try {
      const result = await requestGuestCheckIn(
        (name, args) => supabase.rpc(name, args),
        selectedGuest.guest_id,
        Number(people),
      )
      setAttendance({
        expected: Number(result.expected),
        checkedIn: Number(result.total_checked_in),
        remaining: Number(result.total_remaining),
      })
      setSuccess(result)
      setSelectedGuest(null)
      setConfirming(false)
    } catch (error) {
      setCheckInError(getCheckInErrorMessage(error))
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function refreshSelectedGuest() {
    setRefreshing(true)
    setCheckInError('')
    try {
      const term = normalizeSearchTerm(query) || selectedGuest.full_name
      const [{ data, error }, attendanceResponse] = await Promise.all([
        supabase.rpc('search_guests', { p_query: term, p_limit: 20 }),
        supabase.rpc('get_attendance_stats'),
      ])
      if (error) throw error
      if (attendanceResponse.error) throw attendanceResponse.error
      const updatedGuest = (data || []).find((guest) => guest.guest_id === selectedGuest.guest_id)
      if (!updatedGuest) {
        setResults((current) => current.filter((guest) => guest.guest_id !== selectedGuest.guest_id))
        setSearchError('This guest is no longer active or could not be found. Search again.')
        setSearched(true)
        setSelectedGuest(null)
      } else {
        setSelectedGuest(updatedGuest)
        setPeople('1')
        setCheckInError('Guest status refreshed. Verify the remaining allowance before continuing.')
      }
      const attendanceRow = Array.isArray(attendanceResponse.data)
        ? attendanceResponse.data[0]
        : attendanceResponse.data
      if (attendanceRow) setAttendance(getAttendance(attendanceRow))
    } catch {
      setCheckInError('Could not refresh guest status. Check your connection and try again.')
    } finally {
      setRefreshing(false)
    }
  }

  function backToSearch() {
    setSuccess(null)
    setSelectedGuest(null)
    setCheckInError('')
    window.setTimeout(() => searchInput.current?.focus(), 0)
  }

  const remainingForGuest = selectedGuest
    ? selectedGuest.invited_count - selectedGuest.checked_in_count
    : 0
  const countError = selectedGuest ? validateAdmissionCount(people, remainingForGuest) : ''

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <Brand subtitle="Wedding Guest Check-In" />
        <p className="mt-1 text-center text-sm text-white/60">Sunday, 13 December 2026</p>
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-deepnavy px-4 py-3">
          <p className="min-w-0 text-sm text-white/75">
            Signed in as <span className="font-medium text-gold">{profile.full_name}</span>
            <span className="text-white/45"> · {profile.role}</span>
          </p>
          <div className="flex shrink-0 gap-2">
            {isAdmin && <Link to="/admin" className="btn-ghost">Admin</Link>}
            <button type="button" onClick={signOut} className="btn-ghost">Sign out</button>
          </div>
        </div>
      </header>

      <section aria-label="Attendance summary" className="mt-5 grid grid-cols-3 gap-2">
        {[
          ['Expected', attendance.expected],
          ['Checked in', attendance.checkedIn],
          ['Remaining', attendance.remaining],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-deepnavy px-3 py-4 text-center">
            <p className="text-xs text-white/55">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-beige">
              {attendanceLoading ? '—' : count.toLocaleString()}
            </p>
          </div>
        ))}
      </section>
      {attendanceError && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm" role="alert">
          <span>{attendanceError}</span>
          <button type="button" className="btn-ghost shrink-0" onClick={() => {
            setAttendanceLoading(true)
            loadAttendance()
              .catch(() => setAttendanceError('Attendance totals could not be loaded.'))
              .finally(() => setAttendanceLoading(false))
          }}>Retry</button>
        </div>
      )}

      {success ? (
        <section className="mt-6 rounded-2xl border border-gold/50 bg-deepnavy p-5 sm:p-6" aria-live="polite">
          <p className="text-center text-xs font-semibold tracking-[0.2em] text-gold">GUEST CHECKED IN SUCCESSFULLY</p>
          <h2 className="mt-3 text-center font-serif text-2xl text-beige">
            {success.household_name || success.full_name}
          </h2>
          <dl className="mt-5 space-y-3 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-white/60">Admitted now</dt><dd className="font-semibold">{success.people_admitted} {success.people_admitted === 1 ? 'person' : 'people'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/60">Checked in for this invitation</dt><dd className="font-semibold">{success.checked_in_count} / {success.invited_count}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/60">Remaining allowance</dt><dd className="font-semibold">{success.remaining_allowance}</dd></div>
            {formatTime(success.checked_in_at) && (
              <div className="flex justify-between gap-4"><dt className="text-white/60">Confirmed at</dt><dd className="text-right">{formatTime(success.checked_in_at)}</dd></div>
            )}
          </dl>
          <button type="button" className="btn-primary mt-6" onClick={backToSearch}>Back to Search</button>
        </section>
      ) : (
        <>
          <section className="mt-6">
            <label htmlFor="guest-search" className="mb-2 block text-sm font-medium text-beige">Find an invitation</label>
            <input
              ref={searchInput}
              id="guest-search"
              type="search"
              autoComplete="off"
              className="field"
              placeholder="Search guest or household name..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-describedby="search-status"
            />
            <div id="search-status" className="mt-2 min-h-5 text-sm text-white/60" aria-live="polite">
              {searching && 'Searching guests…'}
              {!searching && searchError && <span role="alert" className="text-red-200">{searchError}</span>}
              {!searching && !searchError && searched && results.length === 0 && 'No matching invitations. Check the spelling and try again.'}
            </div>
          </section>

          {!selectedGuest && results.length > 0 && (
            <section aria-label="Guest search results" className="mt-2 space-y-2">
              {results.map((guest) => {
                const remaining = guest.invited_count - guest.checked_in_count
                return (
                  <button
                    type="button"
                    key={guest.guest_id}
                    onClick={() => chooseGuest(guest)}
                    className="min-h-16 w-full rounded-xl border border-white/10 bg-deepnavy px-4 py-3 text-left transition-colors hover:border-gold/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block font-medium text-white">{guest.full_name}</span>
                        {guest.household_name && <span className="mt-0.5 block text-sm text-white/55">{guest.household_name}</span>}
                      </span>
                      <span className="shrink-0 text-right text-xs text-white/55">
                        {remaining > 0 ? `${remaining} remaining` : 'Fully checked in'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </section>
          )}

          {selectedGuest && (
            <section className="mt-3 rounded-2xl border border-white/10 bg-deepnavy p-5" aria-labelledby="guest-details-title">
              <button type="button" className="mb-4 text-sm text-gold underline underline-offset-4" onClick={() => {
                setSelectedGuest(null)
                setCheckInError('')
                setConfirming(false)
              }}>← Back to results</button>
              <h2 id="guest-details-title" className="font-serif text-xl text-beige">{selectedGuest.full_name}</h2>
              {selectedGuest.household_name && (
                <p className="mt-1 text-sm text-white/60">Invitation group: {selectedGuest.household_name}</p>
              )}
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-white/60">People invited</dt><dd className="font-semibold">{selectedGuest.invited_count}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/60">Already checked in</dt><dd className="font-semibold">{selectedGuest.checked_in_count}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/60">Remaining allowance</dt><dd className="font-semibold text-gold">{remainingForGuest}</dd></div>
              </dl>

              {remainingForGuest === 0 ? (
                <div className="mt-5 rounded-lg border border-gold/30 bg-midnight p-4" role="status">
                  <p className="font-semibold tracking-wide text-gold">ALREADY FULLY CHECKED IN</p>
                  <p className="mt-1 text-sm text-white/70">{selectedGuest.invited_count} invited · {selectedGuest.checked_in_count} checked in</p>
                  {formatTime(selectedGuest.last_checked_in_at) && (
                    <p className="mt-2 text-xs text-white/50">Most recent check-in: {formatTime(selectedGuest.last_checked_in_at)}</p>
                  )}
                </div>
              ) : (
                <>
                  <label htmlFor="people-arriving" className="mt-5 mb-2 block text-sm font-medium text-beige">How many are arriving now?</label>
                  <input
                    id="people-arriving"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={remainingForGuest}
                    step="1"
                    className="field"
                    disabled={submitting}
                    value={people}
                    onChange={(event) => {
                      setPeople(event.target.value)
                      setConfirming(false)
                      setCheckInError('')
                    }}
                    aria-describedby="admission-help"
                    aria-invalid={Boolean(countError)}
                  />
                  <p id="admission-help" className="mt-2 text-xs text-white/50">
                    Choose 1 to {remainingForGuest} {remainingForGuest === 1 ? 'person' : 'people'}.
                  </p>
                  {countError && (
                    <p className="mt-2 text-sm text-red-200" role="alert">{countError}</p>
                  )}
                  {checkInError && (
                    <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm" role="alert">
                      <p>{checkInError}</p>
                      <button
                        type="button"
                        className="mt-2 text-sm font-medium text-beige underline underline-offset-4 disabled:opacity-50"
                        disabled={refreshing || submitting}
                        onClick={refreshSelectedGuest}
                      >{refreshing ? 'Refreshing…' : 'Refresh guest status'}</button>
                    </div>
                  )}
                  {!confirming ? (
                    <button
                      type="button"
                      className="btn-primary mt-5"
                      disabled={Boolean(countError) || submitting}
                      onClick={() => setConfirming(true)}
                    >Review Check-In</button>
                  ) : (
                    <div className="mt-5 rounded-xl border border-gold/30 bg-midnight p-4">
                      <p className="text-sm text-white/80">
                        Confirm that <span className="font-semibold text-beige">{people}</span>
                        {' '}{Number(people) === 1 ? 'person' : 'people'} from{' '}
                        <span className="font-semibold text-beige">{selectedGuest.household_name || selectedGuest.full_name}</span>
                        {' '}have arrived?
                      </p>
                      {checkInError && <p className="mt-3 text-sm text-red-200" role="alert">{checkInError}</p>}
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button type="button" className="btn-ghost" disabled={submitting} onClick={() => setConfirming(false)}>Cancel</button>
                        <button type="button" className="btn-primary" disabled={submitting || Boolean(countError)} onClick={submitCheckIn}>
                          {submitting ? 'Recording…' : 'Confirm Check-In'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}
