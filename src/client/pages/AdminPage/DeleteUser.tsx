import { CustomCursorSurface } from '@shared/ui/CustomCursor/CustomCursor'
import { useRef, useState } from 'react'
import type { AdminUser } from '@contracts/admin'
import { api } from '@shared/api/api'

export function DeleteUser({
  user,
  self,
  onDeleted,
}: {
  user: AdminUser
  self: boolean
  onDeleted: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function close() {
    if (!inFlight.current) {
      dialog.current?.close()
      trigger.current?.focus()
    }
  }
  async function remove() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await api.deleteUser(user.id, user.username)
      dialog.current?.close()
      onDeleted()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete this user.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <button
        ref={trigger}
        className="button button-danger admin-delete"
        disabled={self}
        title={self ? 'Your administrator account is protected' : undefined}
        aria-label={`Delete @${user.username}`}
        onClick={() => {
          setError('')
          dialog.current?.showModal()
        }}
      >
        Delete user
      </button>
      <dialog
        ref={dialog}
        className="admin-delete-dialog"
        aria-labelledby={`delete-title-${user.id}`}
        aria-describedby={`delete-description-${user.id}`}
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
      >
        <CustomCursorSurface />
        <h2 id={`delete-title-${user.id}`}>Delete @{user.username}?</h2>
        <p id={`delete-description-${user.id}`}>
          Permanently delete {user.displayName}'s account, profile, partnerships, and shared game
          history. Their partners will also lose those games. This cannot be undone.
        </p>
        <p>
          Related recordings are queued for the next cleanup run, normally within 15 minutes.
          Existing playback links may work briefly. They can create a new account by signing in
          again.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        <div className="admin-delete-actions">
          <button className="button button-secondary" autoFocus disabled={busy} onClick={close}>
            Cancel
          </button>
          <button className="button button-danger" disabled={busy} onClick={() => void remove()}>
            {busy ? 'Deleting…' : 'Permanently delete user'}
          </button>
        </div>
      </dialog>
    </>
  )
}
