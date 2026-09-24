import { useEffect } from 'react'

export function useTouchInputMode() {
  useEffect(() => {
    const touchInput = window.matchMedia('(hover: none), (pointer: coarse)')
    const syncInputMode = () => {
      document.documentElement.classList.toggle('touch-input', touchInput.matches)
    }

    syncInputMode()
    touchInput.addEventListener('change', syncInputMode)
    return () => {
      touchInput.removeEventListener('change', syncInputMode)
      document.documentElement.classList.remove('touch-input')
    }
  }, [])
}
