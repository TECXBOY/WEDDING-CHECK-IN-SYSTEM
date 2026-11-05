import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractPassToken,
  normalizeRegistrationName,
  normalizeRegistrationPhone,
  validateAttendeeNames,
} from '../src/lib/registration.js'

const TOKEN = 'a'.repeat(64)

test('pass scanner extracts only well-formed 64-character pass tokens', () => {
  assert.equal(extractPassToken(TOKEN), TOKEN)
  assert.equal(extractPassToken(`https://example.test/pass/${TOKEN}`), TOKEN)
  assert.equal(extractPassToken(`https://example.test/pass/${TOKEN}?name=private`), TOKEN)
  assert.equal(extractPassToken('https://example.test/pass/not-a-token'), null)
  assert.equal(extractPassToken('unrelated QR contents'), null)
})

test('registration validates capacity and duplicate attendee names', () => {
  assert.deepEqual(validateAttendeeNames(['Amina', '  John  '], 2), {
    error: '',
    attendees: ['Amina', 'John'],
  })
  assert.match(validateAttendeeNames(['Amina', 'amina'], 2).error, /unique/)
  assert.match(validateAttendeeNames(['Amina', 'John'], 1).error, /between 1 and 1/)
  assert.match(validateAttendeeNames(['', '  '], 3).error, /between 1 and 3/)
})

test('registration name and phone normalization handles common formats', () => {
  assert.equal(normalizeRegistrationName('Mr. Amina Kargbo   Jr.'), 'amina kargbo jr')
  assert.equal(normalizeRegistrationPhone('076 123 4567'), '+232761234567')
  assert.equal(normalizeRegistrationPhone('+23276 123 4567'), '+232761234567')
  assert.equal(normalizeRegistrationPhone('761234567'), '+232761234567')
})
