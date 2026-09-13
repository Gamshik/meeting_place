import { useState, type FormEvent } from 'react'
import type { Profile } from '../../shared/contracts'
import { browserTimeZone, supportedTimeZones } from '../lib/time-zone'
export function ProfileEditor({
  profile,
  disabled,
  onSave,
  onCopy,
}: {
  profile: Profile
  disabled: boolean
  onSave: (input: { username: string; displayName: string; timeZone: string }) => Promise<boolean>
  onCopy: () => void
}) {
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [username, setUsername] = useState(profile.username)
  const [timeZone, setTimeZone] = useState(profile.timeZone ?? browserTimeZone())
  const dirty =
    displayName !== profile.displayName ||
    username !== profile.username ||
    timeZone !== profile.timeZone
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!disabled && dirty) await onSave({ displayName, username, timeZone })
  }
  return (
    <section className="profile-editor">
      <div className="profile-summary">
        <div className="profile-avatar">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            profile.displayName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <p>@{profile.username}</p>
          <button className="text-action" onClick={onCopy}>
            Copy username
          </button>
        </div>
      </div>
      <form onSubmit={submit}>
        <label>
          Display name
          <input
            className="input"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={80}
            required
            disabled={disabled}
          />
        </label>
        <label>
          Username
          <input
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            required
            disabled={disabled}
          />
        </label>
        <label>
          Activity timezone
          <input
            className="input"
            value={timeZone}
            list="activity-time-zone-options"
            onChange={(event) => setTimeZone(event.target.value)}
            maxLength={64}
            required
            disabled={disabled}
            autoComplete="off"
          />
          <span className="profile-field-help">
            Determines which day your practice belongs to. It is not based on your IP or VPN.
          </span>
          <datalist id="activity-time-zone-options">
            {supportedTimeZones(timeZone).map((zone) => (
              <option value={zone} key={zone} />
            ))}
          </datalist>
        </label>
        <div className="row-actions">
          <button className="button button-primary" disabled={disabled || !dirty} type="submit">
            {disabled ? 'Saving…' : 'Save profile'}
          </button>
          {dirty && (
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled}
              onClick={() => {
                setDisplayName(profile.displayName)
                setUsername(profile.username)
                setTimeZone(profile.timeZone ?? browserTimeZone())
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
