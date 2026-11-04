export function normalizeSearchTerm(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function validateAdmissionCount(value, remaining) {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Enter a whole number of people to check in.'
  }

  const count = Number(value)
  if (!Number.isSafeInteger(count)) {
    return 'Enter a whole number of people to check in.'
  }
  if (count < 1) {
    return 'At least 1 person must be checked in.'
  }
  if (count > remaining) {
    return `Choose a number between 1 and ${remaining}.`
  }
  return ''
}

export async function requestGuestCheckIn(rpc, guestId, people) {
  const { data, error } = await rpc('record_guest_check_in', {
    p_guest_id: guestId,
    p_people: people,
  })
  if (error) throw error

  const result = Array.isArray(data) ? data[0] : data
  if (!result) throw new Error('The check-in result was not returned.')
  return result
}
