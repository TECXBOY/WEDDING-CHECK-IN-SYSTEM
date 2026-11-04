import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { ADMIN_PAGE_SIZE } from '../../lib/adminData'
import { supabase } from '../../lib/supabase'

export default function StaffPanel() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('usher')
  const [inviting, setInviting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: responseError } = await supabase.rpc('admin_list_staff', {
        p_offset: page * ADMIN_PAGE_SIZE,
        p_limit: ADMIN_PAGE_SIZE,
      })
      if (responseError) throw responseError
      setStaff(data || [])
      setTotal(Number(data?.[0]?.total_rows || 0))
    } catch {
      setStaff([])
      setTotal(0)
      setError('Staff accounts could not be loaded. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  async function invite(event) {
    event.preventDefault()
    if (!email.trim() || !fullName.trim()) return
    setInviting(true)
    setError('')
    setMessage('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('invite-staff', {
        body: { email: email.trim(), full_name: fullName.trim(), role },
      })
      if (invokeError || data?.error) {
        setError('Staff invitation failed. Confirm the invite-staff Edge Function is deployed and try again.')
        return
      }
      setEmail('')
      setFullName('')
      setRole('usher')
      setMessage('Invitation sent and staff profile created. The staff member must accept the email invitation.')
      await load()
    } catch {
      setError('Staff invitation failed. Confirm the invite-staff Edge Function is deployed and try again.')
    } finally {
      setInviting(false)
    }
  }

  async function changeActive(member) {
    const action = member.is_active ? 'Disable' : 'Enable'
    if (!window.confirm(`${action} access for ${member.full_name}?`)) return
    setBusyId(member.id)
    setError('')
    setMessage('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_staff_active', {
        p_staff_id: member.id,
        p_is_active: !member.is_active,
      })
      if (rpcError) {
        setError(rpcError.code === '23514'
          ? 'The only active administrator cannot be disabled.'
          : 'Staff access could not be changed. You cannot change your own account.')
      } else {
        setMessage(`Staff account ${member.is_active ? 'disabled' : 'enabled'}.`)
        await load()
      }
    } catch {
      setError('Staff access could not be changed because the request failed. Retry after checking the connection.')
    } finally {
      setBusyId('')
    }
  }

  async function changeRole(member, nextRole) {
    if (nextRole === member.role) return
    if (!window.confirm(`Change ${member.full_name}'s role from ${member.role} to ${nextRole}?`)) return
    setBusyId(member.id)
    setError('')
    setMessage('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_staff_role', {
        p_staff_id: member.id,
        p_role: nextRole,
      })
      if (rpcError) {
        setError(rpcError.code === '23514'
          ? 'The only active administrator cannot be demoted.'
          : 'Staff role could not be changed. You cannot change your own role.')
      } else {
        setMessage('Staff role updated.')
        await load()
      }
    } catch {
      setError('Staff role could not be changed because the request failed. Retry after checking the connection.')
    } finally {
      setBusyId('')
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))

  return (
    <section aria-labelledby="staff-heading">
      <h2 id="staff-heading" className="font-serif text-2xl text-beige">Staff access</h2>
      <p className="mt-1 text-sm text-white/55">Invitations use Supabase Auth. Passwords are never stored or handled by this app.</p>

      <form className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-deepnavy p-4 sm:grid-cols-2" onSubmit={invite}>
        <label className="text-sm text-white/70">Staff name
          <input className="field mt-1" maxLength="200" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label className="text-sm text-white/70">Email address
          <input className="field mt-1" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="text-sm text-white/70">Role
          <select className="field mt-1" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="usher">Usher</option><option value="admin">Administrator</option>
          </select>
        </label>
        <button type="submit" className="btn-primary self-end" disabled={inviting || !email.trim() || !fullName.trim()}>
          {inviting ? 'Sending invitation…' : 'Invite staff'}
        </button>
      </form>

      {error && <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm" role="alert">{error} <button type="button" className="underline" onClick={load}>Retry</button></p>}
      {message && <p className="mt-4 rounded-lg border border-white/10 p-3 text-sm" role="status">{message}</p>}

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/55"><tr><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Added</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-white/10">
            {loading && <tr><td colSpan="5" className="px-4 py-8 text-center text-white/55">Loading staff…</td></tr>}
            {!loading && !error && staff.map((member) => (
              <tr key={member.id}>
                <td className="px-4 py-3"><span className="block font-medium">{member.full_name}</span><span className="text-xs text-white/50">{member.email || member.id}</span></td>
                <td className="px-4 py-3">
                  {member.id === profile.id ? member.role : (
                    <select aria-label={`Role for ${member.full_name}`} className="rounded border border-white/20 bg-midnight px-2 py-2" disabled={busyId === member.id} value={member.role} onChange={(e) => changeRole(member, e.target.value)}>
                      <option value="usher">Usher</option><option value="admin">Administrator</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">{member.is_active ? 'Active' : 'Disabled'}</td>
                <td className="px-4 py-3">{new Date(member.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">{member.id === profile.id ? <span className="text-xs text-white/45">Current account</span> : <button type="button" className="text-gold underline underline-offset-2 disabled:opacity-50" disabled={busyId === member.id} onClick={() => changeActive(member)}>{busyId === member.id ? 'Saving…' : member.is_active ? 'Disable' : 'Enable'}</button>}</td>
              </tr>
            ))}
            {!loading && !error && staff.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-white/55">No staff accounts found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-white/60"><span>Page {page + 1} of {pageCount}</span><div className="flex gap-2"><button type="button" className="btn-ghost" disabled={!page || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" className="btn-ghost" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </section>
  )
}
