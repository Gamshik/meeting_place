import { useState, type FormEvent } from 'react'

export function InvitePartnerForm({
  onInvite,
  disabled,
}: {
  disabled: boolean
  onInvite: (username: string) => Promise<boolean>
}) {
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting || disabled) return
    setIsSubmitting(true)

    try {
      const invitationSent = await onInvite(username)

      if (invitationSent) {
        setUsername('')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="invite-form" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="partner-username">
        Friend’s username
      </label>
      <div className="invite-input">
        <span aria-hidden="true">@</span>
        <input
          id="partner-username"
          autoFocus
          disabled={isSubmitting || disabled}
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
        disabled={isSubmitting || disabled}
      >
        {isSubmitting ? 'Sending…' : 'Send invite'}
      </button>
    </form>
  )
}
