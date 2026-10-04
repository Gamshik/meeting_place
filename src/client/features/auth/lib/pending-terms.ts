import { TERMS_VERSION } from '@contracts/legal'
const key = 'meeting-place:pending-terms'
export function rememberTerms() {
  sessionStorage.setItem(key, JSON.stringify({ version: TERMS_VERSION, createdAt: Date.now() }))
}
export function forgetTerms() {
  sessionStorage.removeItem(key)
}
export function hasPendingTerms() {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    return (
      value?.version === TERMS_VERSION &&
      typeof value.createdAt === 'number' &&
      value.createdAt <= Date.now() &&
      Date.now() - value.createdAt < 30 * 60 * 1000
    )
  } catch {
    return false
  }
}
