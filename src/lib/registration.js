export function extractPassToken(value) {
  const input = String(value || '').trim()
  try {
    const parsed = new URL(input)
    const match = parsed.pathname.match(/\/pass\/([a-f0-9]{64})\/?$/i)
    if (match) return match[1]
  } catch {
    if (/^[a-f0-9]{64}$/i.test(input)) return input
  }
  return null
}

export function validateAttendeeNames(names, maxAttendees) {
  const attendees = names.map((name) => name.trim()).filter(Boolean)
  if (!attendees.length || attendees.length > maxAttendees) {
    return { error: `Enter between 1 and ${maxAttendees} attendee names.`, attendees }
  }
  if (new Set(attendees.map((name) => name.toLocaleLowerCase())).size !== attendees.length) {
    return { error: 'Each attendee name must be unique within the household.', attendees }
  }
  return { error: '', attendees }
}
