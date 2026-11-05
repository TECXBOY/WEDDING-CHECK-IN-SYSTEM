import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { PRODUCTION_APP_ORIGIN } from '../../config/invitation'
import { supabase } from '../../lib/supabase'

function PassDownload({ token, label }) {
  const [qr, setQr] = useState('')
  const url = `${PRODUCTION_APP_ORIGIN}/pass/${encodeURIComponent(token)}`
  useEffect(() => {
    let active = true
    QRCode.toDataURL(url, { width: 420, margin: 3, errorCorrectionLevel: 'H' })
      .then((image) => { if (active) setQr(image) })
      .catch(() => { if (active) setQr('') })
    return () => { active = false }
  }, [url])
  return (
    <div className="mt-3 rounded-lg border border-gold/25 bg-midnight p-3 text-center">
      <p className="text-sm text-beige">{label} — replacement pass generated. Previous active passes are invalid.</p>
      {qr && <img src={qr} alt={`Admission pass for ${label}`} className="mx-auto my-2 w-44 rounded bg-white p-2" />}
      {qr && <a className="btn-ghost inline-block" href={qr} download="thw26-reissued-pass.png">Download replacement pass</a>}
      <p className="mt-2 break-all text-xs text-white/45">{url}</p>
    </div>
  )
}

export default function RegistrationsPanel() {
  const [households, setHouseholds] = useState([])
  const [requests, setRequests] = useState([])
  const [approvingRequest, setApprovingRequest] = useState(null)
  const [approval, setApproval] = useState({ full_name: '', household_name: '', invited_count: '' })
  const [attendees, setAttendees] = useState([])
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState(null)
  const [reference, setReference] = useState(null)
  const [replacement, setReplacement] = useState(null)
  const [editing, setEditing] = useState({})
  const [loading, setLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestsError, setRequestsError] = useState('')
  const [notice, setNotice] = useState('')
  const [copyError, setCopyError] = useState('')

  const loadHouseholds = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: responseError } = await supabase.rpc('admin_list_registrations')
      if (responseError) throw responseError
      setHouseholds(data || [])
    } catch {
      setError('Registration records could not be loaded. Confirm migration 0006 is applied.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true)
    setRequestsError('')
    try {
      const { data, error: responseError } = await supabase.rpc('admin_list_registration_requests')
      if (responseError) throw responseError
      setRequests(data || [])
    } catch {
      setRequestsError('Registration requests could not be loaded. Confirm migration 0008 is applied.')
    } finally {
      setRequestsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHouseholds()
    loadRequests()
  }, [loadHouseholds, loadRequests])

  function startApproval(request) {
    setApprovingRequest(request.request_id)
    setApproval({ full_name: request.full_name, household_name: '', invited_count: '' })
    setError('')
  }

  async function approveRequest(event, request) {
    event.preventDefault()
    setError('')
    try {
      const invitedCount = Number(approval.invited_count)
      if (!Number.isSafeInteger(invitedCount) || invitedCount < 1 || invitedCount > 2147483647) {
        setError('Enter the approved number of people for this invitation.')
        return
      }
      const { error: responseError } = await supabase.rpc('admin_approve_registration_request', {
        p_request_id: request.request_id,
        p_full_name: approval.full_name.trim(),
        p_household_name: approval.household_name.trim() || null,
        p_invited_count: invitedCount,
      })
      if (responseError) throw responseError
      setApprovingRequest(null)
      setNotice(`${approval.full_name.trim()} was approved and added to the guest list with capacity for ${invitedCount}. They can now retry household registration.`)
      await Promise.all([loadRequests(), loadHouseholds()])
    } catch {
      setError('Could not approve this request. Check whether an invitation with the same name and household already exists.')
    }
  }

  async function dismissRequest(requestId) {
    setError('')
    try {
      const { error: responseError } = await supabase.rpc('admin_resolve_registration_request', {
        p_request_id: requestId,
      })
      if (responseError) throw responseError
      setNotice('Request dismissed; no invitation was created.')
      await loadRequests()
    } catch {
      setError('Could not dismiss this registration request.')
    }
  }

  async function openHousehold(row) {
    setSelected(row)
    setReference(null)
    setReplacement(null)
    setNotice('')
    setError('')
    try {
      const [attendeeResult, historyResult] = await Promise.all([
        supabase.rpc('admin_list_attendees', { p_guest_id: row.guest_id }),
        supabase.rpc('admin_registration_history', { p_guest_id: row.guest_id }),
      ])
      if (attendeeResult.error) throw attendeeResult.error
      if (historyResult.error) throw historyResult.error
      setAttendees(attendeeResult.data || [])
      setHistory(historyResult.data || [])
      setEditing({})
    } catch {
      setError('Household registration details and history could not be loaded.')
    }
  }

  async function issueReference(guestId) {
    setError('')
    setNotice('')
    setReference(null)
    try {
      const { data, error: responseError } = await supabase.rpc('admin_issue_invitation_code', { p_guest_id: guestId })
      if (responseError) throw responseError
      setReference(data)
      setNotice('New unique household reference created. It is shown only once here; share it with this invitation household.')
      await loadHouseholds()
    } catch {
      setError('Could not create or rotate the invitation reference.')
    }
  }

  async function correctName(attendee) {
    const fullName = editing[attendee.attendee_id]?.trim()
    if (!fullName) return
    try {
      const { error: responseError } = await supabase.rpc('admin_update_attendee', {
        p_attendee_id: attendee.attendee_id, p_full_name: fullName,
      })
      if (responseError) throw responseError
      setNotice('Attendee name updated; the correction was added to registration history.')
      await openHousehold(selected)
      await loadHouseholds()
    } catch {
      setError('Could not correct this attendee. Check for duplicate names and try again.')
    }
  }

  async function reissuePass(attendee) {
    setError('')
    try {
      const { data, error: responseError } = await supabase.rpc('admin_reissue_pass', { p_attendee_id: attendee.attendee_id })
      if (responseError) throw responseError
      setReplacement({ attendee_id: attendee.attendee_id, full_name: attendee.full_name, token: data })
      setNotice('Pass reissued. The prior pass has been revoked.')
      await openHousehold(selected)
    } catch {
      setError('Could not reissue the pass. It may already have been used.')
    }
  }

  async function revokePass(attendee) {
    setError('')
    try {
      const { error: responseError } = await supabase.rpc('admin_revoke_pass', { p_attendee_id: attendee.attendee_id })
      if (responseError) throw responseError
      setNotice('Active pass revoked. It cannot be used to enter; issue a replacement if needed.')
      setReplacement(null)
      await openHousehold(selected)
    } catch {
      setError('Could not revoke the pass. It may already be used or revoked.')
    }
  }

  async function setReviewStatus() {
    try {
      const { error: responseError } = await supabase.rpc('admin_set_registration_review', {
        p_guest_id: selected.guest_id,
        p_needs_review: !selected.needs_admin_review,
      })
      if (responseError) throw responseError
      setNotice(selected.needs_admin_review ? 'Administrative review cleared.' : 'Household marked for administrative review; staff scans will not admit its passes.')
      await loadHouseholds()
      setSelected({ ...selected, needs_admin_review: !selected.needs_admin_review })
    } catch {
      setError('Could not update the household review status.')
    }
  }

  return (
    <section aria-labelledby="registration-management-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="registration-management-heading" className="font-serif text-2xl text-beige">Household registrations</h2>
          <p className="mt-1 text-sm text-white/55">Review unmatched registration requests, view household attendees, correct names, and manage admission passes.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => { loadHouseholds(); loadRequests() }} disabled={loading || requestsLoading}>
          {loading || requestsLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-gold/30 bg-gold/10 p-3 text-sm text-beige">{notice}</p>}
      <section aria-labelledby="registration-requests-heading" className="mt-5 rounded-xl border border-gold/25 bg-deepnavy p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="registration-requests-heading" className="font-serif text-xl text-beige">Registration requests</h3>
          <span className="text-xs text-white/50">{requests.filter((request) => request.status === 'pending').length} pending</span>
        </div>
        <p className="mt-1 text-sm text-white/55">These are people whose name and phone did not match an approved invitation. Verify them and, if appropriate, update the guest record before they retry registration.</p>
        {requestsError && <p role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">{requestsError}</p>}
        {requestsLoading ? <p className="mt-3 text-sm text-white/50">Loading requests…</p> : requests.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {requests.map((request) => (
              <li key={request.request_id} className="rounded-lg border border-white/10 bg-midnight p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-beige">{request.full_name}</p>
                    <a className="mt-1 block break-all text-sm text-gold underline" href={`tel:${request.phone_number}`}>{request.phone_number}</a>
                    <p className="mt-2 text-xs text-white/45">
                      Last requested {new Date(request.last_submitted_at).toLocaleString()}
                      {request.submission_count > 1 ? ` · ${request.submission_count} attempts` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-1 text-xs ${request.status === 'pending' ? 'bg-yellow-300/15 text-yellow-100' : request.status === 'approved' ? 'bg-emerald-300/15 text-emerald-100' : 'bg-white/10 text-white/50'}`}>
                    {request.status === 'pending' ? 'Pending' : request.status === 'approved' ? 'Approved' : 'Dismissed'}
                  </span>
                </div>
                {request.status === 'pending' && (
                  <>
                    {approvingRequest === request.request_id ? (
                      <form className="mt-3 space-y-2 border-t border-white/10 pt-3" onSubmit={(event) => approveRequest(event, request)}>
                        <label className="block text-xs text-white/65" htmlFor={`approve-name-${request.request_id}`}>Approved guest name
                          <input id={`approve-name-${request.request_id}`} className="field mt-1 py-2" maxLength="200" required value={approval.full_name}
                            onChange={(event) => setApproval((current) => ({ ...current, full_name: event.target.value }))} />
                        </label>
                        <label className="block text-xs text-white/65" htmlFor={`approve-household-${request.request_id}`}>Household name (optional)
                          <input id={`approve-household-${request.request_id}`} className="field mt-1 py-2" maxLength="200" value={approval.household_name}
                            onChange={(event) => setApproval((current) => ({ ...current, household_name: event.target.value }))} />
                        </label>
                        <label className="block text-xs text-white/65" htmlFor={`approve-capacity-${request.request_id}`}>Approved guest capacity
                          <input id={`approve-capacity-${request.request_id}`} className="field mt-1 py-2" type="number" min="1" step="1" required value={approval.invited_count}
                            onChange={(event) => setApproval((current) => ({ ...current, invited_count: event.target.value }))} />
                        </label>
                        <p className="text-xs text-white/45">Approving creates an active guest invitation and saves this phone number for household matching.</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" className="btn-primary text-xs">Confirm approval</button>
                          <button type="button" className="btn-ghost text-xs" onClick={() => setApprovingRequest(null)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn-primary text-xs" onClick={() => startApproval(request)}>
                          Approve &amp; add invitation
                        </button>
                        <button type="button" className="btn-ghost text-xs" onClick={() => dismissRequest(request.request_id)}>
                          Dismiss
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-white/50">No registration requests have been submitted.</p>}
      </section>
      {reference && (
        <div className="mt-3 rounded-lg border border-gold/30 bg-midnight p-4 text-center">
          <p className="break-all font-mono text-lg tracking-wider text-gold">New household reference: {reference}</p>
          <button type="button" className="btn-ghost mt-3" onClick={async () => {
            try {
              await navigator.clipboard.writeText(reference)
              setCopyError('')
              setNotice('Invitation reference copied.')
            } catch {
              setCopyError('Could not copy automatically. Select and copy the reference above.')
            }
          }}>Copy reference</button>
          {copyError && <p role="alert" className="mt-2 text-sm text-yellow-100">{copyError}</p>}
        </div>
      )}
      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ul className="max-h-[70vh] space-y-2 overflow-auto">
          {households.map((row) => (
            <li key={row.guest_id} className={`rounded-xl border p-3 ${selected?.guest_id === row.guest_id ? 'border-gold/50 bg-gold/5' : 'border-white/10 bg-deepnavy'}`}>
              <button className="w-full text-left" onClick={() => openHousehold(row)}>
                <span className="block font-medium text-beige">{row.household_name || row.invitation_name}</span>
                <span className="mt-1 block text-xs text-white/50">{row.attendee_count}/{row.invited_count} registered · {row.checked_in_count} checked in · {row.has_reference ? 'reference issued' : 'no reference'}</span>
              </button>
              <button className="btn-ghost mt-2 text-xs" onClick={() => issueReference(row.guest_id)}>
                {row.has_reference ? 'Rotate reference' : 'Issue reference'}
              </button>
            </li>
          ))}
          {!loading && households.length === 0 && <li className="rounded-lg border border-white/10 p-4 text-sm text-white/50">No active invitation records found.</li>}
        </ul>

        {selected && (
          <section className="rounded-xl border border-white/10 bg-deepnavy p-4">
            <h3 className="font-serif text-lg text-beige">{selected.household_name || selected.invitation_name}</h3>
            <p className="mt-1 text-xs text-white/50">Capacity {selected.invited_count} · currently checked in {selected.checked_in_count}</p>
            <p className={`mt-2 text-xs ${selected.needs_admin_review ? 'text-yellow-100' : 'text-white/45'}`}>
              {selected.needs_admin_review ? 'Requires administrative review' : 'Registration clear'}
            </p>
            {selected.attendee_count > 0 && <button className="btn-ghost mt-2 text-xs" onClick={setReviewStatus}>
              {selected.needs_admin_review ? 'Clear review flag' : 'Mark for admin review'}
            </button>}
            <h4 className="mt-4 text-sm font-semibold text-white/75">Registered attendees</h4>
            {attendees.length ? <ul className="mt-2 space-y-3">
              {attendees.map((attendee) => (
                <li key={attendee.attendee_id} className="rounded-lg border border-white/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-beige">{attendee.full_name}</span>
                    <span className="text-xs text-white/50">{attendee.checked_in_at ? 'checked in' : `pass: ${attendee.pass_status}`}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input className="field min-w-0 flex-1 py-2 text-sm" aria-label={`Correct ${attendee.full_name}`}
                      value={editing[attendee.attendee_id] ?? attendee.full_name}
                      onChange={(event) => setEditing((current) => ({ ...current, [attendee.attendee_id]: event.target.value }))} />
                    <button className="btn-ghost" onClick={() => correctName(attendee)}>Save name</button>
                  </div>
                  {!attendee.checked_in_at && (
                    <>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button className="btn-ghost text-xs" onClick={() => reissuePass(attendee)}>Reissue pass</button>
                        {attendee.pass_status === 'active' && <button className="btn-ghost text-xs" onClick={() => revokePass(attendee)}>Revoke pass</button>}
                      </div>
                      {replacement?.attendee_id === attendee.attendee_id && <PassDownload token={replacement.token} label={replacement.full_name} />}
                    </>
                  )}
                </li>
              ))}
            </ul> : <p className="mt-2 text-sm text-white/50">No registration has been completed for this household.</p>}
            <h4 className="mt-5 text-sm font-semibold text-white/75">Registration and admission history</h4>
            <ol className="mt-2 max-h-48 space-y-2 overflow-auto text-xs text-white/55">
              {history.map((event, index) => (
                <li key={`${event.occurred_at}-${index}`} className="border-l border-gold/30 pl-3">
                  <span className="text-white/75">{event.event_type.replaceAll('_', ' ')}</span>
                  {event.actor_name && ` · ${event.actor_name}`}
                  {` · ${new Date(event.occurred_at).toLocaleString()}`}
                  {event.details && Object.keys(event.details).length > 0 && (
                    <span className="mt-1 block break-words text-white/40">{JSON.stringify(event.details)}</span>
                  )}
                </li>
              ))}
              {!history.length && <li>No registration or attendee admission history yet.</li>}
            </ol>
          </section>
        )}
      </div>
    </section>
  )
}
