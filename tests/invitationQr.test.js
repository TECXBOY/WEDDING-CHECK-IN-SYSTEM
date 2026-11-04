import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { INVITATION_QR_FILES, STAFF_CHECK_IN_URL } from '../src/config/invitation.js'

test('shared invitation QR is pinned to the production staff check-in route', () => {
  assert.equal(
    STAFF_CHECK_IN_URL,
    'https://ing-fatmata-kargbo-ing-alhaji-s-koi.vercel.app/check-in',
  )
  assert.equal(new URL(STAFF_CHECK_IN_URL).pathname, '/check-in')
  assert.equal(new URL(STAFF_CHECK_IN_URL).protocol, 'https:')
  assert.equal(new URL(STAFF_CHECK_IN_URL).hostname, 'ing-fatmata-kargbo-ing-alhaji-s-koi.vercel.app')
})

test('permanent shared QR files are generated in the public downloads directory', () => {
  for (const [format, assetPath] of Object.entries(INVITATION_QR_FILES)) {
    const file = new URL(`../public${assetPath}`, import.meta.url)
    assert.ok(fs.existsSync(file), `Expected generated ${format.toUpperCase()} asset`)
    assert.ok(fs.statSync(file).size > 0, `Expected non-empty ${format.toUpperCase()} asset`)
  }
  const png = fs.readFileSync(new URL(`../public${INVITATION_QR_FILES.png}`, import.meta.url))
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  const svg = fs.readFileSync(new URL(`../public${INVITATION_QR_FILES.svg}`, import.meta.url), 'utf8')
  assert.match(svg, /<svg/)
  const pdf = fs.readFileSync(new URL(`../public${INVITATION_QR_FILES.pdf}`, import.meta.url), 'utf8')
  assert.match(pdf, /^%PDF-/)
})
