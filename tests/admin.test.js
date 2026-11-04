import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attendancePercentage,
  attendanceStatus,
  fetchAdminPages,
  formatCsv,
  parseGuestCsv,
} from '../src/lib/adminData.js'

test('CSV parser supports quoted commas, quotes, and embedded newlines', () => {
  const parsed = parseGuestCsv('full_name,household_name,invited_count,notes\r\n"Doe, Jane","Doe Household",2,"He said ""hello""\nwelcome"')
  assert.equal(parsed.fatalError, '')
  assert.equal(parsed.rows[0].data.full_name, 'Doe, Jane')
  assert.equal(parsed.rows[0].data.notes, 'He said "hello"\nwelcome')
})

test('CSV validation reports missing headers and invalid row values', () => {
  assert.match(parseGuestCsv('full_name,notes\nAmina,hi').fatalError, /invited_count/)
  const parsed = parseGuestCsv('full_name,invited_count\n,0')
  assert.equal(parsed.rows[0].errors.length, 2)
  assert.match(parseGuestCsv('full_name,invited_count').fatalError, /no guest rows/)
})

test('CSV preview detects duplicate names in a household without merging records', () => {
  const parsed = parseGuestCsv('full_name,household_name,invited_count\nAmina,Koita Family,2\namina,koita family,1')
  assert.equal(parsed.rows[0].duplicate, undefined)
  assert.equal(parsed.rows[1].duplicate, true)
  const invalidFirst = parseGuestCsv('full_name,household_name,invited_count\nAmina,Koita Family,0\nAmina,Koita Family,1')
  assert.equal(invalidFirst.rows[1].duplicate, undefined)
})

test('CSV rejects malformed quoted fields and duplicate headers', () => {
  assert.match(parseGuestCsv('full_name,invited_count\n"Amina,2').fatalError, /unclosed/)
  assert.match(parseGuestCsv('full_name,full_name,invited_count\nAmina,Amina,1').fatalError, /duplicate/)
})

test('CSV export quotes data and neutralizes spreadsheet formulas', () => {
  const csv = formatCsv([
    { full_name: '=SUM(A1:A2)', notes: 'Said "hello",\nthere' },
  ], [['full_name', 'Guest'], ['notes', 'Notes']])
  assert.match(csv, /"'=SUM\(A1:A2\)"/)
  assert.match(csv, /Said ""hello"",\nthere/)
  assert.ok(csv.startsWith('\uFEFF'))
})

test('attendance status and percentage handle partial and empty totals', () => {
  assert.equal(attendanceStatus({ checked_in_count: 0, invited_count: 3 }), 'Not checked in')
  assert.equal(attendanceStatus({ checked_in_count: 2, invited_count: 3 }), 'Partially checked in')
  assert.equal(attendanceStatus({ checked_in_count: 3, invited_count: 3 }), 'Fully checked in')
  assert.equal(attendancePercentage(0, 0), 0)
  assert.equal(attendancePercentage(3, 4), 75)
})

test('admin pagination retrieves bounded pages and propagates RPC errors', async () => {
  const calls = []
  const rpc = async (_name, args) => {
    calls.push(args.p_offset)
    return { data: args.p_offset === 0
      ? [{ id: 1, total_rows: 2 }, { id: 2, total_rows: 2 }]
      : [], error: null }
  }
  const result = await fetchAdminPages(rpc, 'admin_list_guests', {}, { pageSize: 2, maxRows: 10 })
  assert.deepEqual(result.rows.map((row) => row.id), [1, 2])
  assert.deepEqual(calls, [0])
  await assert.rejects(fetchAdminPages(async () => ({ error: new Error('denied') }), 'admin_list_guests'))
})
