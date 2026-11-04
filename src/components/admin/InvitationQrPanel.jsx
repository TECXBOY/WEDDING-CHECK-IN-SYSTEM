import { useState } from 'react'
import { INVITATION_QR_FILES, STAFF_CHECK_IN_URL } from '../../config/invitation'

const DOWNLOADS = [
  ['png', 'Download PNG'],
  ['svg', 'Download SVG'],
  ['pdf', 'Download print-ready PDF'],
]

export default function InvitationQrPanel() {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  async function copyUrl() {
    setCopied(false)
    setCopyError('')
    try {
      await navigator.clipboard.writeText(STAFF_CHECK_IN_URL)
      setCopied(true)
    } catch {
      setCopyError('Could not copy automatically. Select and copy the URL above.')
    }
  }

  return (
    <section aria-labelledby="invitation-qr-heading" className="mx-auto max-w-2xl">
      <h2 id="invitation-qr-heading" className="font-serif text-2xl text-beige">Invitation QR Code</h2>
      <p className="mt-1 text-sm text-white/55">
        One shared code for all invitations. Scanning opens staff sign-in; it does not identify a guest or grant access.
      </p>

      <div className="mt-5 grid gap-5 rounded-2xl border border-white/10 bg-deepnavy p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:p-6">
        <div className="mx-auto rounded-xl bg-white p-3">
          <img
            src={INVITATION_QR_FILES.png}
            alt="Shared THE_HALAL_WAY_26 staff check-in QR code"
            className="block h-auto w-64 max-w-full"
            width="1200"
            height="1200"
          />
        </div>
        <div>
          <h3 className="font-semibold text-beige">Permanent production destination</h3>
          <p className="mt-2 break-all rounded-lg border border-white/10 bg-midnight p-3 text-sm text-white/80">
            {STAFF_CHECK_IN_URL}
          </p>
          <button type="button" className="btn-ghost mt-3 w-full" onClick={copyUrl}>
            {copied ? 'URL copied' : 'Copy URL'}
          </button>
          {copyError && <p className="mt-2 text-sm text-amber-200" role="alert">{copyError}</p>}
          <p className="mt-4 text-sm leading-6 text-white/65">
            Test scan: use a phone camera and confirm the URL ends in <code>/check-in</code>. Sign in with an authorized staff account to reach guest search.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {DOWNLOADS.map(([format, label]) => (
          <a
            key={format}
            href={INVITATION_QR_FILES[format]}
            download
            className="btn-ghost text-center"
          >
            {label}
          </a>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-white/45">
        These files use the project’s fixed Vercel production alias, never localhost or a preview URL. Keep the Vercel alias assigned to this project active so printed invitations continue to resolve to the same destination.
      </p>
    </section>
  )
}
