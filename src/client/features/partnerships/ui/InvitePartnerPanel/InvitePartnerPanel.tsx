import { useCallback, useState, type FormEvent } from 'react'
import { useCommunity } from '@features/community/model/CommunityContext'
import { api } from '@shared/api/api'
import { Notice, Panel } from '@shared/ui/Panel/Panel'

export function InvitePartnerPanel({ onClose }: { onClose: () => void }) {
  const { refresh } = useCommunity()
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeError = useCallback(() => setError(null), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)

    try {
      await api.invitePartner({ username })
      await refresh()
      onClose()
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Could not send the invitation.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Panel
      title="Invite a friend"
      onClose={onClose}
      feedback={error ? <Notice error message={error} onClose={closeError} /> : undefined}
    >
      <form className="invite-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="header-partner-username">
          Friend’s username
        </label>
        <div className="invite-input">
          <span aria-hidden="true">@</span>
          <input
            id="header-partner-username"
            autoFocus
            disabled={isSubmitting}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="their_username"
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            required
          />
        </div>
        <button
          className="button button-primary invite-submit"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Sending…' : 'Send invite'}
        </button>
      </form>
    </Panel>
  )
}
