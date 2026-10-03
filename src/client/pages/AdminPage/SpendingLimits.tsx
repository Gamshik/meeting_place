import { useEffect, useState } from 'react'
import { aiLimitsSchema } from '@contracts/ai-limits'
import { api } from '@shared/api/api'

export function SpendingLimits({ userId, username }: { userId: string; username: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="admin-limits">
      <button className="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Spending limits
      </button>
      {open ? <LimitsForm userId={userId} username={username} /> : null}
    </div>
  )
}

function LimitsForm({ userId, username }: { userId: string; username: string }) {
  const [monthly, setMonthly] = useState('')
  const [lifetime, setLifetime] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void api
      .getAiLimits(userId)
      .then(({ data }) => {
        if (!active) return
        setMonthly(data.monthlyUsd ?? '')
        setLifetime(data.lifetimeUsd ?? '')
        setLoaded(true)
      })
      .catch(() => {
        if (active) setError('Could not load limits. Close and reopen to retry.')
      })
    return () => {
      active = false
    }
  }, [userId])
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = aiLimitsSchema.safeParse({
          monthlyUsd: monthly.trim() || null,
          lifetimeUsd: lifetime.trim() || null,
        })
        setMessage('')
        setError('')
        if (!parsed.success) {
          setError('Enter nonnegative USD amounts with up to 12 decimal places.')
          return
        }
        setSaving(true)
        void api
          .setAiLimits(userId, parsed.data)
          .then(() => setMessage('Limits saved.'))
          .catch(() => setError('Could not save limits. Try again.'))
          .finally(() => setSaving(false))
      }}
    >
      <fieldset disabled={!loaded || saving}>
        <legend>Limits for @{username}</legend>
        <label>
          Lifetime spending limit (USD)
          <input
            inputMode="decimal"
            value={lifetime}
            placeholder="Unlimited"
            onChange={(event) => setLifetime(event.target.value)}
          />
        </label>
        <label>
          Monthly spending limit (USD)
          <input
            inputMode="decimal"
            value={monthly}
            placeholder="Unlimited"
            onChange={(event) => setMonthly(event.target.value)}
          />
        </label>
        <p>
          Blank means unlimited. Zero blocks paid AI. Lifetime takes priority; monthly resets in
          UTC.
        </p>
        <button className="button" type="submit">
          {saving ? 'Saving…' : 'Save limits'}
        </button>
      </fieldset>
      {!loaded && !error ? <p role="status">Loading limits…</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  )
}
