import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSearchTerm,
  requestGuestCheckIn,
  validateAdmissionCount,
} from '../src/lib/checkin.js'
import { getCheckInErrorMessage } from '../src/lib/checkinErrors.js'

test('guest search trims surrounding whitespace and handles empty input', () => {
  assert.equal(normalizeSearchTerm('  Amina Koroma  '), 'Amina Koroma')
  assert.equal(normalizeSearchTerm('   '), '')
  assert.equal(normalizeSearchTerm(null), '')
})

test('valid whole-number check-in fits the remaining allowance', () => {
  assert.equal(validateAdmissionCount('2', 2), '')
})

test('partial check-in leaves the correct remaining count', () => {
  const invited = 4
  const checkedIn = 2
  const arrivingNow = 1
  const remaining = invited - checkedIn - arrivingNow
  assert.equal(remaining, 1)
  assert.equal(validateAdmissionCount(String(arrivingNow), invited - checkedIn), '')
})

test('fully checked-in invitations reject another admission', () => {
  assert.match(validateAdmissionCount('1', 0), /between 1 and 0/)
})

test('zero, negative, fractional, and non-numeric counts are rejected', () => {
  for (const value of ['0', '-1', '1.5', 'not a number', '']) {
    assert.notEqual(validateAdmissionCount(value, 4), '')
  }
})

test('counts above the remaining allowance are rejected', () => {
  assert.match(validateAdmissionCount('3', 2), /between 1 and 2/)
})

test('the check-in RPC returns only a database-confirmed result', async () => {
  const result = { guest_id: 'guest-1', checked_in_count: 2, people_admitted: 1 }
  const rpc = async (name, args) => {
    assert.equal(name, 'record_guest_check_in')
    assert.deepEqual(args, { p_guest_id: 'guest-1', p_people: 1 })
    return { data: [result], error: null }
  }
  assert.equal(await requestGuestCheckIn(rpc, 'guest-1', 1), result)
  assert.equal(result.people_admitted, 1)
})

test('a failed or empty check-in RPC cannot produce a success result', async () => {
  await assert.rejects(
    requestGuestCheckIn(async () => ({ data: null, error: { code: 'P0001' } }), 'guest-1', 1),
  )
  await assert.rejects(
    requestGuestCheckIn(async () => { throw new Error('network failure') }, 'guest-1', 1),
    /network failure/,
  )
  await assert.rejects(
    requestGuestCheckIn(async () => ({ data: [], error: null }), 'guest-1', 1),
    /result was not returned/,
  )
})

test('database failures map to safe, actionable UI messages', () => {
  assert.match(getCheckInErrorMessage({ code: '42501' }), /does not have permission/)
  assert.match(getCheckInErrorMessage({ code: 'P0002' }), /no longer active/)
  assert.match(getCheckInErrorMessage({ code: 'P0001' }), /allowance changed/)
  assert.doesNotMatch(getCheckInErrorMessage({ message: 'secret database detail' }), /secret/)
})
