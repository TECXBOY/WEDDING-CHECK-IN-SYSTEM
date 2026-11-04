import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import Brand from '../components/Brand'
import { PRODUCTION_APP_ORIGIN } from '../config/invitation'
import { validateAttendeeNames } from '../lib/registration'
import { supabase } from '../lib/supabase'

function PassCard({ pass }) {
  const [qr, setQr] = useState('')
  const url = `${PRODUCTION_APP_ORIGIN}/pass/${encodeURIComponent(pass.token)}`
  useEffect(() => {
    let active = true
    QRCode.toDataURL(url, { width: 420, margin: 3, errorCorrectionLevel: 'H' })
      .then((value) => { if (active) setQr(value) })
      .catch(() => { if (active) setQr('') })
    return () => { active = false }
  }, [url])

  return (
    <article className="rounded-xl border border-white/10 bg-deepnavy p-4 text-center">
      <h3 className="font-semibold text-beige">{pass.full_name}</h3>
      {qr ? (
        <>
          <img src={qr} alt={`Admission pass QR code for ${pass.full_name}`} className="mx-auto my-3 w-52 rounded bg-white p-2" />
          <a className="btn-ghost inline-block" href={qr} download={`thw26-pass-${pass.full_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`}>Save pass PNG</a>
        </>
      ) : <p className="mt-3 text-sm text-white/60">Preparing pass QR…</p>}
      <p className="mt-2 break-all text-xs text-white/45">{url}</p>
    </article>
  )
}

export default function Register() {
  const [code, setCode] = useState('')
  const [invitation, setInvitation] = useState(null)
  const [names, setNames] = useState([''])
  const [passes, setPasses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const maxAttendees = invitation
    ? Number(invitation.invited_count) - Number(invitation.checked_in_count)
    : 0

  async function validateCode(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('validate_household_code', { p_code: code.trim() })
      if (rpcError) throw rpcError
      setInvitation(data)
      setNames([''])
      if (data.is_registered) setMessage('This household is already registered. Retrieve replacement passes below if needed.')
    } catch (requestError) {
      setError(requestError.code === 'PGRST202'
        ? 'Household registration is not enabled yet. Ask the administrator to apply database migration 0006.'
        : requestError.message?.includes('fetch')
          ? 'Could not reach the registration service. Check your connection and try again.'
        : 'That invitation reference is invalid or inactive. Check the code on your printed invitation.')
      setInvitation(null)
    } finally {
      setLoading(false)
    }
  }

  async function submitRegistration(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const validation = validateAttendeeNames(names, maxAttendees)
    if (validation.error) {
      setError(validation.error)
      return
    }
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('register_household', {
        p_code: code.trim(),
        p_names: validation.attendees,
      })
      if (rpcError) throw rpcError
      setPasses(data || [])
      setMessage('Registration confirmed. Save each admission pass; registration alone does not grant entry.')
    } catch (requestError) {
      setError(requestError.code === 'PGRST202'
        ? 'Household registration is not enabled yet. Ask the administrator to apply database migration 0006.'
        : requestError.message?.includes('already registered')
          ? 'This household is already registered. Use the pass retrieval option.'
          : requestError.message?.includes('capacity')
            ? 'The number of attendees exceeds the remaining invitation capacity. Please review the names.'
            : 'Registration could not be completed. Check the names and connection, then try again.')
    } finally {
      setLoading(false)
    }
  }

  async function retrievePasses() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const { data, error: rpcError } = await supabase.rpc('household_reissue_passes', { p_code: code.trim() })
      if (rpcError) throw rpcError
      setPasses(data || [])
      setMessage(data?.length
        ? 'Replacement passes are ready. Previously issued passes have been revoked.'
        : 'There are no unadmitted household passes to retrieve.')
    } catch {
      setError('Passes could not be retrieved. Confirm the invitation reference and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <Brand subtitle="Household guest registration" />
      <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-6 text-white/65">
        Enter the unique reference printed on your invitation. Only an approved invitation can register attendees, up to its stated capacity.
      </p>
      <form onSubmit={validateCode} className="mx-auto mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="invitation-code">Invitation reference</label>
        <input id="invitation-code" className="field flex-1 uppercase" autoComplete="off" maxLength={24}
          value={code} onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="24-character invitation reference" required />
        <button className="btn-primary sm:w-auto" disabled={loading || code.trim().length !== 24}>
          {loading ? 'Checking…' : 'Verify invitation'}
        </button>
      </form>

      {error && <p role="alert" className="mx-auto mt-4 max-w-xl rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">{error}</p>}
      {message && <p role="status" className="mx-auto mt-4 max-w-xl rounded-lg border border-gold/30 bg-gold/10 p-3 text-sm text-beige">{message}</p>}

      {invitation && !passes.length && !invitation.is_registered && (
        <section className="mx-auto mt-6 max-w-xl rounded-xl border border-white/10 bg-deepnavy p-5">
          <h2 className="font-serif text-xl text-beige">{invitation.household_name || invitation.invitation_name}</h2>
          <p className="mt-2 text-sm text-white/65">Maximum attendees: {maxAttendees}</p>
          {maxAttendees < 1 ? <p className="mt-3 text-sm text-yellow-100">This invitation has no remaining registration capacity. Contact the event administrator.</p> : (
          <form onSubmit={submitRegistration} className="mt-5 space-y-3">
            {names.map((name, index) => (
              <div key={index}>
                <label className="mb-1 block text-sm text-white/70" htmlFor={`attendee-${index}`}>Attendee {index + 1}</label>
                <input id={`attendee-${index}`} className="field" maxLength={200} required={index === 0}
                  value={name} onChange={(event) => setNames((current) => current.map((item, i) => i === index ? event.target.value : item))} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" disabled={names.length >= maxAttendees}
                onClick={() => setNames((current) => [...current, ''])}>Add attendee</button>
              {names.length > 1 && <button type="button" className="btn-ghost"
                onClick={() => setNames((current) => current.slice(0, -1))}>Remove last</button>}
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Registering…' : 'Confirm registration'}</button>
          </form>
          )}
        </section>
      )}

      {invitation?.is_registered && !passes.length && (
        <div className="mx-auto mt-5 max-w-xl">
          <button type="button" className="btn-primary" onClick={retrievePasses} disabled={loading}>
            {loading ? 'Preparing…' : 'Retrieve / replace household passes'}
          </button>
        </div>
      )}

      {passes.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-center font-serif text-2xl text-beige">Your household admission passes</h2>
          <p className="mb-5 text-center text-sm text-white/60">Save each pass to your phone. The QR contains an access token only, not guest details. Each pass admits one person once.</p>
          <div className="grid gap-4 sm:grid-cols-2">{passes.map((pass) => <PassCard key={pass.attendee_id} pass={pass} />)}</div>
        </section>
      )}
      <p className="mt-8 text-center text-sm text-white/50"><Link className="underline" to="/login">Staff sign-in</Link></p>
    </main>
  )
}
