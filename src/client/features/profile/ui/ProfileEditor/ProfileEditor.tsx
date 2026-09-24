import { useState, type FormEvent } from 'react'
import type { Profile } from '@contracts/contracts'
import { browserTimeZone, supportedTimeZones } from '@shared/lib/time-zone'

export function ProfileEditor({
  profile,
  disabled,
  isEditing = false,
  onToggleEdit,
  onCloseEdit,
  onSave,
  onCopy,
  onSignOut,
}: {
  profile: Profile
  disabled: boolean
  isEditing?: boolean
  onToggleEdit?: () => void
  onCloseEdit?: () => void
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
    if (!disabled && dirty) {
      await onSave({ displayName, username, timeZone })
    }
  }

  return (
    <div className="account-profile-section">
      <div className="account-profile-heading-shell" data-collapsed={isEditing} inert={isEditing}>
        <header className="account-profile-heading" aria-hidden={isEditing}>
          <div className="account-profile-avatar">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="account-profile-identity">
            <h1>{profile.displayName}</h1>
            <div className="account-profile-handle">
              <span>@{profile.username}</span>
              <button
                type="button"
                className="text-action account-copy-handle"
                aria-label="Copy username"
                onClick={onCopy}
              >
                Copy
              </button>
            </div>
          </div>
          <div className="account-profile-actions">
            <button
              type="button"
              className="button button-secondary account-profile-edit-btn"
              onClick={onToggleEdit}
              aria-expanded={isEditing}
            >
              Profile settings
            </button>
            <button
              type="button"
              className="profile-signout"
              disabled={disabled}
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </header>
      </div>

      {isEditing && (
        <section className="profile-editor-drawer" aria-labelledby="profile-settings-title">
          <div className="profile-editor-drawer-header">
            <h2 id="profile-settings-title">Profile settings</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close settings"
              onClick={onCloseEdit}
            >
              ×
            </button>
          </div>
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
              <button
                type="button"
                className="profile-signout"
                disabled={disabled}
                onClick={onSignOut}
              >
                Sign out
              </button>
              <div className="profile-save-area">
                {dirty && <p aria-live="polite">You have unsaved changes</p>}
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
                  <button
                    className="button button-primary"
                    disabled={disabled || !dirty}
                    type="submit"
                  >
                    {disabled ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </footer>
          </form>
        </section>
      )}
    </div>
  )
}
