export function getCheckInErrorMessage(error) {
  if (error?.code === '42501') {
    return 'Your account does not have permission to check in guests. Contact the administrator.'
  }
  if (error?.code === 'P0002') {
    return 'This invitation is no longer active or could not be found. Search again.'
  }
  if (error?.code === '22023') {
    return 'Choose a whole number of people within the remaining allowance.'
  }
  if (error?.code === 'P0001') {
    return 'The remaining allowance changed. Refresh guest status and try again.'
  }
  return 'Check-in could not be confirmed. Refresh guest status before trying again.'
}
