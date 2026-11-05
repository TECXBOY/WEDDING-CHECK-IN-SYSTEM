import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import Brand from '../components/Brand'
import { PRODUCTION_APP_ORIGIN } from '../config/invitation'
import { normalizeRegistrationPhone, validateAttendeeNames } from '../lib/registration'
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
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [match, setMatch] = useState(null)
  const [names, setNames] = useState([''])
  const [passes, setPasses] = useState([])
  const [duplicateRegistration, setDuplicateRegistration] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const normalizedPhone = normalizeRegistrationPhone(phone)
  const maxAttendees = match ? Number(match.invited_count) - Number(match.checked_in_count) : 0

  async function validateMatch(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setMatch(null)
    setNames([''])
    setPasses([])
    setDuplicateRegistration(false)
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('lookup_household_registration', {
        p_full_name: fullName,
        p_phone: normalizedPhone,
      })
      if (rpcError) throw rpcError

      if (data?.status === 'matched') {
        setMatch(data.guest)
        if (data.guest.is_registered) {
          setDuplicateRegistration(true)
          setMessage('This phone number has already been used for registration. No new passes were created. If you need your existing passes again, use the replacement option below or contact the wedding registration team.')
        } else {
          setMessage('We found your household. Add the attendees below and confirm your registration.')
        }
      } else {
        const { error: requestError } = await supabase.rpc('submit_registration_request', {
          p_full_name: fullName,
          p_phone: normalizedPhone,
        })
        if (requestError) throw requestError
        setMessage('Your request was sent to the event administrators for review. They may contact you using the phone number provided. No admission passes are issued until your household is verified.')
      }
    } catch (requestError) {
      setError(requestError.message?.includes('fetch')
        ? 'Could not reach the registration service. Check your connection and try again.'
        : 'We could not confirm your household right now. Please try again or ask the administrator for help.')
      setMatch(null)
    } finally {
      setLoading(false)
    }
  }

  async function submitRegistration(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!match) {
      setError('Please confirm your household first before registering attendees.')
      return
    }
    const validation = validateAttendeeNames(names, maxAttendees)
    if (validation.error) {
      setError(validation.error)
      return
    }
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('register_household_match', {
        p_full_name: fullName,
        p_phone: normalizedPhone,
        p_names: validation.attendees,
      })
      if (rpcError) throw rpcError
      if (!data?.length) throw new Error('No new admission passes were issued.')
      setPasses(data || [])
      setDuplicateRegistration(false)
      setMessage('Registration successful. Save each person’s unique admission pass; registration alone does not grant entry.')
      setMatch(null)
    } catch (requestError) {
      setDuplicateRegistration(requestError.code === '23505' || requestError.message?.includes('already registered'))
      setError(requestError.message?.includes('already registered')
        ? 'This phone number has already been used for registration. No new passes were created. Use the replacement option below or contact the wedding registration team.'
        : requestError.message?.includes('capacity')
        ? 'The number of attendees exceeds the remaining household capacity. Please review the names.'
        : requestError.message?.includes('No approved household')
        ? 'We could not confirm your household from the details you provided.'
        : 'Registration could not be completed. Check the details and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function retrievePasses() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const { data, error: rpcError } = await supabase.rpc('household_reissue_passes_by_identity', {
        p_full_name: fullName,
        p_phone: normalizedPhone,
      })
      if (rpcError) throw rpcError
      setPasses(data || [])
      setDuplicateRegistration(!data?.length)
      setMessage(data?.length
        ? 'Replacement passes are ready. Previous active passes were revoked; save these new passes.'
        : 'There are no active household passes to retrieve for this matched household.')
    } catch {
      setError('Passes could not be retrieved for this household. Please confirm your name and phone and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <Brand subtitle="Household guest registration" />
      <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-6 text-white/65">
        Register your household using your full name and phone number. The system matches that information against the approved guest list before issuing individual admission passes.
      </p>

      <form onSubmit={validateMatch} className="mx-auto mt-6 max-w-xl space-y-3">
        <div>
        <label className="mb-1 block text-sm text-white/70" htmlFor="full-name">Full name</label>
        <input id="full-name" className="field" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Enter the registrant's full name" required />
        </div>
        <div>
        <label className="mb-1 block text-sm text-white/70" htmlFor="phone-number">Phone number</label>
        <input id="phone-number" className="field" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 0761234567 or +232761234567" inputMode="tel" required />
        </div>
        <button className="btn-primary w-full" disabled={loading || !fullName.trim() || !normalizedPhone}>
        {loading ? 'Checking…' : 'Verify household'}
        </button>
      </form>

      {error && <p role="alert" className="mx-auto mt-4 max-w-xl rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">{error}</p>}
      {message && <p role="status" className="mx-auto mt-4 max-w-xl rounded-lg border border-gold/30 bg-gold/10 p-3 text-sm text-beige">{message}</p>}

      {match && !passes.length && (
        <section className="mx-auto mt-6 max-w-xl rounded-xl border border-white/10 bg-deepnavy p-5">
        <h2 className="font-serif text-xl text-beige">{match.household_name || match.full_name}</h2>
        {!duplicateRegistration && <p className="mt-2 text-sm text-white/65">Remaining household capacity: {maxAttendees}</p>}
        {duplicateRegistration ? (
          <div className="mt-4 rounded-lg border border-yellow-300/30 bg-yellow-300/10 p-4">
            <p className="text-sm text-yellow-100">This household is already registered. Do not submit a second registration.</p>
            <button type="button" className="btn-primary mt-3" onClick={retrievePasses} disabled={loading}>
              {loading ? 'Preparing…' : 'Replace lost admission passes'}
            </button>
            <p className="mt-2 text-xs text-white/50">Replacing passes revokes existing active QR codes and issues new ones.</p>
          </div>
        ) : maxAttendees < 1 ? <p className="mt-3 text-sm text-yellow-100">This household has no remaining registration capacity. Please contact the administrator.</p> : (
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

      {match && !duplicateRegistration && !passes.length && (
        <div className="mx-auto mt-5 max-w-xl">
        <button type="button" className="btn-primary" onClick={retrievePasses} disabled={loading}>
          {loading ? 'Preparing…' : 'Replace lost household passes'}
        </button>
        <p className="mt-2 text-center text-xs text-white/45">Replacement revokes any previously issued active passes.</p>
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
