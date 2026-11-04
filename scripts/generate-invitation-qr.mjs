import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { REGISTRATION_URL } from '../src/config/invitation.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(root, 'public', 'downloads')
const basename = 'thw26-registration-qr'

if (REGISTRATION_URL !== 'https://ing-fatmata-kargbo-ing-alhaji-s-koi.vercel.app/register') {
  throw new Error('The invitation QR must use the approved stable production registration URL.')
}

await fs.mkdir(outputDirectory, { recursive: true })
const png = await QRCode.toBuffer(REGISTRATION_URL, {
  type: 'png',
  errorCorrectionLevel: 'H',
  margin: 4,
  width: 1200,
  color: { dark: '#101B35', light: '#FFFFFF' },
})
const svg = await QRCode.toString(REGISTRATION_URL, {
  type: 'svg',
  errorCorrectionLevel: 'H',
  margin: 4,
  width: 1200,
  color: { dark: '#101B35', light: '#FFFFFF' },
})
const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
const pageWidth = pdf.internal.pageSize.getWidth()
pdf.setTextColor(16, 27, 53)
pdf.setFont('helvetica', 'bold')
pdf.setFontSize(24)
pdf.text('THE_HALAL_WAY_26', pageWidth / 2, 34, { align: 'center' })
pdf.setFont('helvetica', 'normal')
pdf.setFontSize(16)
pdf.text('Household Guest Registration', pageWidth / 2, 45, { align: 'center' })
pdf.addImage(`data:image/png;base64,${png.toString('base64')}`, 'PNG', 45, 59, 120, 120)
pdf.setFontSize(11)
pdf.text('Scan to register your household using the unique reference code on your invitation.', pageWidth / 2, 195, {
  align: 'center',
  maxWidth: pageWidth - 36,
})
pdf.setFontSize(9)
pdf.text(REGISTRATION_URL, pageWidth / 2, 207, { align: 'center' })

await Promise.all([
  fs.writeFile(path.join(outputDirectory, `${basename}.png`), png),
  fs.writeFile(path.join(outputDirectory, `${basename}.svg`), svg, 'utf8'),
  fs.writeFile(path.join(outputDirectory, `${basename}.pdf`), Buffer.from(pdf.output('arraybuffer'))),
])

console.log(`Generated invitation QR assets for ${REGISTRATION_URL}`)
