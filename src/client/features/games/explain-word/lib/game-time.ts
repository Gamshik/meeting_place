import { useEffect, useState } from 'react'

export function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} sec`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder === 0 ? `${minutes} min` : `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function parseTimestamp(value?: string | null) {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function useServerNow(serverTime?: string, frozen = false) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (frozen) return
    const observedAt = Date.now()
    const parsedServerTime = serverTime ? Date.parse(serverTime) : Number.NaN
    const serverOffset = Number.isFinite(parsedServerTime) ? parsedServerTime - observedAt : 0
    const timer = setInterval(() => setNow(Date.now() + serverOffset), 250)
    return () => clearInterval(timer)
  }, [frozen, serverTime])

  return now
}
