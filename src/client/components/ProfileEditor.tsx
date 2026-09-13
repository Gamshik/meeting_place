import { useState, type FormEvent } from 'react'
import type { Profile } from '../../shared/contracts'
import { browserTimeZone, supportedTimeZones } from '../lib/time-zone'
export function ProfileEditor({
  profile,
  disabled,
  onSave,
  onCopy,
  onSignOut,
}: {
  profile: Profile
  disabled: boolean
  onSave: (input: { username: string; displayName: string; timeZone: string }) => Promise<boolean>
  onCopy: () => void
  onSignOut: () => void
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
    <section className="profile-editor" aria-labelledby="profile-settings-title">
      <header className="profile-editor-header">
        <div className="profile-avatar">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            profile.displayName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="profile-editor-intro">
          <p>My account</p>
          <h1 id="profile-settings-title">Profile settings</h1>
          <span>Manage the details your practice partners see.</span>
        </div>
        <div className="profile-handle">
          <span>Friend handle</span>
          <strong>@{profile.username}</strong>
          <button type="button" className="text-action" aria-label="Copy username" onClick={onCopy}>
            Copy
          </button>
        </div>
      </header>
      <form onSubmit={submit}>
        <div className="profile-fields-grid">
          <label>
            <span>Display name</span>
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
            <span>Username</span>
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
          <label className="profile-timezone-field">
            <span>Activity timezone</span>
            <select
              className="input"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              required
              disabled={disabled}
            >
              {supportedTimeZones(timeZone).map((zone) => (
                <option value={zone} key={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer className="profile-editor-footer">
          <button type="button" className="profile-signout" disabled={disabled} onClick={onSignOut}>
            Sign out
          </button>
          <div className="profile-save-area">
            <p aria-live="polite">{dirty ? 'You have unsaved changes' : 'Everything is saved'}</p>
            <div className="row-actions">
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
                  Reset
                </button>
              )}
              <button className="button button-primary" disabled={disabled || !dirty} type="submit">
                {disabled ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </footer>
      </form>
    </section>
  )
}
