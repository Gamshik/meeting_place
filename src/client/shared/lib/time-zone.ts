export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function supportedTimeZones(current: string) {
  const supportedValuesOf = (
    Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }
  ).supportedValuesOf
  const detected = browserTimeZone()
  const available = supportedValuesOf
    ? supportedValuesOf('timeZone')
    : [
        'UTC',
        'Africa/Johannesburg',
        'America/Chicago',
        'America/Los_Angeles',
        'America/New_York',
        'America/Sao_Paulo',
        'Asia/Dubai',
        'Asia/Kolkata',
        'Asia/Singapore',
        'Asia/Tokyo',
        'Australia/Sydney',
        'Europe/Berlin',
        'Europe/London',
        'Europe/Minsk',
      ]

  return [...new Set([current, detected, 'UTC', ...available])].sort()
}
