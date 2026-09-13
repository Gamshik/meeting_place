import { useEffect, useRef, type ReactNode } from 'react'

export function Panel({
  title,
  feedback,
  children,
  onClose,
}: {
  title: string
  feedback?: ReactNode
  children: ReactNode
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    const previousFocus = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (previousFocus instanceof HTMLElement) queueMicrotask(() => previousFocus.focus())
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="content-dialog"
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="panel-content">
        <div className="panel-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close panel" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="panel-body">{children}</div>
        {feedback}
      </div>
    </dialog>
  )
}

export function Notice({
  message,
  onClose,
  error = false,
}: {
  message: string
  onClose: () => void
  error?: boolean
}) {
  useEffect(() => {
    if (error) return
    const timer = setTimeout(onClose, 6000)
    return () => clearTimeout(timer)
  }, [message, onClose, error])
  return (
    <div className={`toast ${error ? 'toast-error' : ''}`} role={error ? 'alert' : 'status'}>
      <span className="toast-icon" aria-hidden="true">
        {error ? '!' : '✓'}
      </span>
      <span className="toast-message">{message}</span>
      <button aria-label="Dismiss notification" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
