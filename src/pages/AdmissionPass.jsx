import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import Brand from '../components/Brand'
import { PRODUCTION_APP_ORIGIN } from '../config/invitation'
import { supabase } from '../lib/supabase'

export default function AdmissionPass() {
  const { token } = useParams()
  const [pass, setPass] = useState(null)
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const url = `${PRODUCTION_APP_ORIGIN}/pass/${encodeURIComponent(token)}`
    Promise.all([
      supabase.rpc('get_admission_pass', { p_token: token }),
      QRCode.toDataURL(url, { width: 560, margin: 4, errorCorrectionLevel: 'H' }),
    ]).then(([response, image]) => {
      if (!active) return
      if (response.error) throw response.error
      if (!response.data || response.data.status !== 'active') {
        setError(response.data?.status === 'used'
          ? 'This pass has already been used.'
          : 'This pass is invalid or has been revoked.')
        return
      }
      setPass(response.data)
      setQr(image)
    }).catch(() => {
      if (active) setError('Pass details could not be loaded. Check your connection and try again.')
    })
    return () => { active = false }
  }, [token])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-4 py-8">
      <Brand subtitle="Individual admission pass" />
      {error ? (
        <p role="alert" className="mt-8 rounded-xl border border-danger/50 bg-danger/10 p-5 text-center">{error}</p>
      ) : pass ? (
        <section className="mt-8 w-full rounded-2xl border border-white/10 bg-deepnavy p-5 text-center">
          <p className="text-sm text-white/55">Admit one attendee</p>
          <h2 className="mt-1 text-xl font-semibold text-beige">{pass.full_name}</h2>
          <img src={qr} alt="Individual admission QR code" className="mx-auto my-5 w-full max-w-xs rounded bg-white p-3" />
          <a href={qr} download="thw26-admission-pass.png" className="btn-primary">Save pass to this device</a>
          <p className="mt-4 text-xs text-white/50">Present this QR code to authorized check-in staff. It can be admitted once.</p>
        </section>
      ) : <p className="mt-8 text-white/60">Loading pass…</p>}
      <Link to="/register" className="mt-6 text-sm text-white/55 underline">Household pass access</Link>
    </main>
  )
}
