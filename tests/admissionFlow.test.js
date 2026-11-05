import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/0010_registration_admission_safety.sql', import.meta.url), 'utf8')
const admissionMigration = readFileSync(new URL('../supabase/migrations/0006_household_registration_and_passes.sql', import.meta.url), 'utf8')

test('registration matches both the approved contact name and household phone', () => {
  assert.match(migration, /normalize_registration_phone\(coalesce\(g\.normalized_phone, g\.phone_number\)\) = v_phone/)
  assert.match(migration, /normalize_registration_name\(g\.full_name\) = v_name/)
  assert.match(migration, /normalize_registration_name\(coalesce\(g\.household_name, ''\)\) = v_name/)
  assert.match(migration, /'is_registered', v_registered_count > 0/)
})

test('registration rejects repeated household submissions and hashes unique random pass tokens', () => {
  assert.match(migration, /This household has already registered\. No duplicate admission passes were created/)
  assert.match(migration, /gen_random_bytes\(32\)/)
  assert.match(migration, /digest\(pg_catalog\.convert_to\(v_token, 'UTF8'\), 'sha256'\)/)
  assert.match(migration, /for update/)
})

test('one household phone can serve multiple attendees, with a separate pass returned for each', () => {
  assert.doesNotMatch(migration, /unique\s+(?:index|constraint)[^;]*(?:phone_number|normalized_phone)/i)
  assert.match(migration, /for v_name in\s+select pg_catalog\.btrim\(value #>> '\{\}'\)/)
  assert.match(migration, /'attendee_id', v_attendee_id,\s*'full_name', v_name,\s*'token', v_token/s)
})

test('admission remains staff-only and serializes scans against the household row', () => {
  const admitFunction = admissionMigration.slice(
    admissionMigration.indexOf('create or replace function public.admit_attendee'),
    admissionMigration.indexOf('create or replace function public.search_registered_attendees'),
  )
  assert.match(admitFunction, /not public\.is_staff\(\)/)
  assert.match(admitFunction, /from public\.guests where id = v_registration\.guest_id for update/)
  assert.match(admitFunction, /if v_pass\.status = 'revoked'.*return.*'revoked'/s)
  assert.match(admitFunction, /'already_checked_in'/)
  assert.match(admitFunction, /update public\.admission_passes set status = 'used'/)
  assert.match(admitFunction, /insert into public\.check_in_logs/)
})

test('the existing staff check-in QR assets are unchanged and still target /check-in', () => {
  const expectedHashes = {
    pdf: 'd3eaa7cdf800de03aa580dfaa70d04ae5f131657aba5260e36471e009685cca7',
    png: '6ffac769d01769c262ad5f34f0a4effc831b2f79c38602c6c014580725c655a8',
    svg: '1edc00bc99d7f7270983849af94b0567f503b57dfd780a3084c86915f1cb2130',
  }
  for (const [format, expectedHash] of Object.entries(expectedHashes)) {
    const asset = readFileSync(new URL(`../public/downloads/thw26-staff-check-in-qr.${format}`, import.meta.url))
    assert.equal(createHash('sha256').update(asset).digest('hex'), expectedHash)
  }
  const pdf = readFileSync(new URL('../public/downloads/thw26-staff-check-in-qr.pdf', import.meta.url), 'latin1')
  assert.match(pdf, /\/check-in/)
})
