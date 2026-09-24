type Direction = 'right' | 'left' | 'up-right' | 'down-left' | 'horizontal' | 'turn' | 'refresh'

export function ArrowIcon({ direction = 'right' }: { direction?: Direction }) {
  const rotation =
    direction === 'left'
      ? 180
      : direction === 'up-right'
        ? -45
        : direction === 'down-left'
          ? 135
          : 0
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path
        transform={`rotate(${rotation} 12 12)`}
        d={
          direction === 'refresh'
            ? 'M20 7v5h-5M20 12a8 8 0 1 0-2 6'
            : direction === 'turn'
              ? 'M4 19v-6a7 7 0 0 1 7-7h8m-5-5 5 5-5 5'
              : `M5 12h14m-6-6 6 6-6 6${direction === 'horizontal' ? 'M11 6l-6 6 6 6' : ''}`
        }
      />
    </svg>
  )
}
