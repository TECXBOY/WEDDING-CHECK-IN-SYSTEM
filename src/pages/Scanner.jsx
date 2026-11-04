import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Brand from '../components/Brand'
import { supabase } from '../lib/supabase'
import { extractPassToken } from '../lib/registration'

export default function Scanner() {
  const { profile, isAdmin, signOut } = useAuth()
  const [cameraError, setCameraError] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchError, setSearchError] = useState('')

  const processToken = useCallback(async (value) => {
    if (busyRef.current) return
    const token = extractPassToken(value)
    if (!token) {
      setScanResult({ status: 'invalid' })
      return
    }
    busyRef.current = true
    setBusy(true)
    setScanResult(null)
    try {
      const { data, error } = await supabase.rpc('admit_attendee', { p_token: token })
      if (error) throw error
      setScanResult(data)
    } catch (error) {
      setScanResult({ status: error.code === 'PGRST202' ? 'setup_error' : 'error' })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    let live = true
    const reader = new Html5Qrcode('admission-qr-reader')
    Html5Qrcode.getCameras().then((cameras) => {
      if (!live) return
      if (!cameras?.length) throw new Error('No camera was found.')
      return reader.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => { void processToken(decoded) },
        () => {},
      ).then(() => { if (!live) return reader.stop() })
    }).catch((error) => {
      if (live) setCameraError(error.message || 'Camera permission was denied or unavailable.')
    })
    return () => {
      live = false
      if (reader.isScanning) reader.stop().catch(() => {})
    }
  }, [processToken])

  async function searchAttendees(event) {
    event.preventDefault()
    setSearchError('')
    setResults([])
    try {
      const { data, error } = await supabase.rpc('search_registered_attendees', {
        p_query: query.trim(),
        p_limit: 20,
      })
      if (error) throw error
      setResults(data || [])
      if (!data?.length) setSearchError('No registered attendees matched that name or household.')
    } catch {
      setSearchError('Attendee search failed. Enter at least two characters and try again.')
    }
  }

  async function manualAdmit(attendeeId) {
    setBusy(true)
    setScanResult(null)
    try {
      const { data, error } = await supabase.rpc('manual_admit_attendee', { p_attendee_id: attendeeId })
      if (error) throw error
      setScanResult(data)
      const { data: refreshed, error: refreshError } = await supabase.rpc('search_registered_attendees', {
        p_query: query.trim(), p_limit: 20,
      })
      if (refreshError) {
        setSearchError('Admission recorded, but attendee results could not be refreshed.')
      } else {
        setResults(refreshed || [])
      }
    } catch (error) {
      setScanResult({ status: error.code === 'PGRST202' ? 'setup_error' : 'error' })
    } finally {
      setBusy(false)
    }
  }

  const resultPresentation = {
    approved: ['Entry approved', 'border-green-400/40 bg-green-500/15 text-green-200'],
    invalid: ['Invalid or revoked pass', 'border-red-400/40 bg-red-500/15 text-red-200'],
    revoked: ['Invalid or revoked pass', 'border-red-400/40 bg-red-500/15 text-red-200'],
    already_checked_in: ['Already checked in', 'border-yellow-300/40 bg-yellow-400/15 text-yellow-100'],
    requires_admin_review: ['Registration requires administrative attention', 'border-yellow-300/40 bg-yellow-400/15 text-yellow-100'],
    error: ['Network or server error. No admission was recorded.', 'border-red-400/40 bg-red-500/15 text-red-200'],
    setup_error: ['Scanner database is not configured. Ask the administrator to apply migration 0006.', 'border-red-400/40 bg-red-500/15 text-red-200'],
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-6">
      <Brand subtitle="Staff admission scanner" />
      <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-deepnavy px-4 py-3">
        <p className="text-sm text-white/70">{profile.full_name} · {profile.role}</p>
        <div className="flex gap-2">{isAdmin && <Link to="/admin" className="btn-ghost">Admin</Link>}
          <Link to="/check-in" className="btn-ghost">Legacy check-in</Link>
          <button className="btn-ghost" onClick={signOut}>Sign out</button></div>
      </div>

      <section className="mt-5 rounded-2xl border border-white/10 bg-deepnavy p-4 sm:p-6">
        <h2 className="font-serif text-xl text-beige">Scan an individual pass</h2>
        <p className="mt-1 text-sm text-white/55">Allow camera access. The server verifies each pass and records each attendee once.</p>
        <div id="admission-qr-reader" className="mx-auto mt-4 max-w-lg overflow-hidden rounded-xl bg-midnight" />
        {cameraError && <p role="alert" className="mt-3 rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-100">{cameraError} You can still use the manual admission search below.</p>}
        {scanResult && (
          <p role="status" className={`mt-4 rounded-lg border p-4 text-center font-semibold ${resultPresentation[scanResult.status]?.[1] || resultPresentation.error[1]}`}>
            {scanResult.status === 'approved' && scanResult.full_name ? `${resultPresentation.approved[0]} — ${scanResult.full_name}` : (resultPresentation[scanResult.status]?.[0] || resultPresentation.error[0])}
          </p>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-deepnavy p-4 sm:p-6">
        <h2 className="font-serif text-xl text-beige">Manual admission fallback</h2>
        <p className="mt-1 text-sm text-white/55">Search a registered attendee by name or household, verify the person, then record admission.</p>
        <form onSubmit={searchAttendees} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input className="field flex-1" minLength={2} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Attendee or household name" required />
          <button className="btn-ghost sm:w-auto">Search attendees</button>
        </form>
        {searchError && <p role="status" className="mt-3 text-sm text-yellow-100">{searchError}</p>}
        <ul className="mt-4 space-y-2">
          {results.map((attendee) => (
            <li key={attendee.attendee_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
              <div><p className="font-medium text-beige">{attendee.full_name}</p><p className="text-xs text-white/50">{attendee.household_name || attendee.invitation_name}</p></div>
              {attendee.checked_in_at
                ? <span className="text-sm text-yellow-100">Already checked in</span>
                : <button className="btn-ghost" disabled={busy} onClick={() => manualAdmit(attendee.attendee_id)}>Admit attendee</button>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
