import { useEffect, useState } from 'react'

import { formatDemoClock } from './demo-clock'

export function DemoClock({
  deadline,
  duration,
  title,
  description,
  compact = false,
}: {
  deadline: number
  duration: number
  title: string
  description: string
  compact?: boolean
}) {
  const [seconds, setSeconds] = useState(duration)
  useEffect(() => {
    function update() {
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    }
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [deadline])

  return (
    <section
      className={`live-round-clock${compact ? ' is-compact' : ''}`}
      aria-label={`${title}: ${seconds} seconds remaining`}
    >
      <div>
        <p>{title}</p>
        <span className="sr-only">{description}</span>
      </div>
      <strong role="timer">{formatDemoClock(seconds)}</strong>
    </section>
  )
}
