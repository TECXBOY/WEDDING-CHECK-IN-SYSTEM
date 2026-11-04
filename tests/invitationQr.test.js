import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { INVITATION_QR_FILES, REGISTRATION_URL } from '../src/config/invitation.js'

test('shared invitation QR is pinned to the production household registration route', () => {
  assert.equal(
    REGISTRATION_URL,
    'https://ing-fatmata-kargbo-ing-alhaji-s-koi.vercel.app/register',
  )
  assert.equal(new URL(REGISTRATION_URL).pathname, '/register')
  assert.equal(new URL(REGISTRATION_URL).protocol, 'https:')
  assert.equal(new URL(REGISTRATION_URL).hostname, 'ing-fatmata-kargbo-ing-alhaji-s-koi.vercel.app')
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
