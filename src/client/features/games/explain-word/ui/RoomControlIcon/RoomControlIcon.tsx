export function RoomControlIcon({ icon }: { icon: 'finish' | 'leave' | 'timer' }) {
  if (icon === 'leave') {
    return (
      <svg className="room-control-icon" viewBox="0 0 28 28" aria-hidden="true">
        <path className="room-lobby-home" d="M4 13 14 4l10 9v11H4Z" />
        <path className="room-lobby-door" d="M11 24v-7h6v7" />
      </svg>
    )
  }
  if (icon === 'timer') {
    return (
      <svg className="room-control-icon" viewBox="0 0 28 28" aria-hidden="true">
        <path d="M10 3h8M14 3v3M21.5 7.5l2 2" />
        <circle cx="14" cy="16" r="9" />
        <path className="room-timer-hand" d="M14 16V10m0 6 4 2" />
      </svg>
    )
  }
  return (
    <svg className="room-control-icon" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="10" />
      <rect className="room-end-stop" x="10" y="10" width="8" height="8" rx="1" />
    </svg>
  )
}
