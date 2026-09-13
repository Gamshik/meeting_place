import { useEffect } from 'react'

const interactiveSelector =
  'a[href], button:not(:disabled), input[type="range"], summary, label[for], [role="button"], [role="link"], [data-cursor="interactive"]'
const textSelector =
  'input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="password"], input[type="url"], input[type="tel"], input[type="number"], textarea, select, [contenteditable="true"]'
const stateClasses = [
  'custom-cursor-enabled',
  'custom-cursor-visible',
  'custom-cursor-interactive',
  'custom-cursor-pressed',
  'custom-cursor-over-text',
]

export function CustomCursorSurface() {
  return <div className="custom-cursor" aria-hidden="true" />
}

export function CustomCursor() {
  useEffect(() => {
    const root = document.documentElement
    const finePointer = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    )

    let animationFrame: number | undefined
    let pointerX = 0
    let pointerY = 0

    const disable = () => {
      root.classList.remove(...stateClasses)
    }

    const updatePosition = () => {
      root.style.setProperty('--cursor-x', `${pointerX}px`)
      root.style.setProperty('--cursor-y', `${pointerY}px`)
      animationFrame = undefined
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointer.matches) return

      root.classList.add('custom-cursor-enabled', 'custom-cursor-visible')
      pointerX = event.clientX
      pointerY = event.clientY

      if (animationFrame === undefined) animationFrame = requestAnimationFrame(updatePosition)
    }

    const handlePointerOver = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      root.classList.toggle(
        'custom-cursor-interactive',
        Boolean(target.closest(interactiveSelector)),
      )
      root.classList.toggle('custom-cursor-over-text', Boolean(target.closest(textSelector)))
    }

    const handlePointerDown = () => {
      root.classList.add('custom-cursor-pressed')
    }

    const handlePointerUp = () => {
      root.classList.remove('custom-cursor-pressed')
    }

    const handlePointerLeave = (event: MouseEvent) => {
      if (!event.relatedTarget) root.classList.remove('custom-cursor-visible')
    }

    const handlePreferenceChange = () => {
      if (!finePointer.matches) disable()
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerover', handlePointerOver, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    window.addEventListener('pointerup', handlePointerUp, { passive: true })
    window.addEventListener('mouseout', handlePointerLeave)
    window.addEventListener('blur', disable)
    finePointer.addEventListener('change', handlePreferenceChange)

    return () => {
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
      disable()
      root.style.removeProperty('--cursor-x')
      root.style.removeProperty('--cursor-y')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerover', handlePointerOver)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('mouseout', handlePointerLeave)
      window.removeEventListener('blur', disable)
      finePointer.removeEventListener('change', handlePreferenceChange)
    }
  }, [])

  return <CustomCursorSurface />
}
