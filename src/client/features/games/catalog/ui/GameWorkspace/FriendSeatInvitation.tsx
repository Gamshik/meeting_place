import { useState } from 'react'
import { InvitePartnerPanel } from '@features/partnerships/ui/InvitePartnerPanel/InvitePartnerPanel'
import './FriendSeatInvitation.css'

export function FriendSeatInvitation() {
  const [inviteOpen, setInviteOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="friend-seat-invitation"
        onClick={() => setInviteOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={inviteOpen}
        aria-label="Invite first friend"
        title="Invite first friend"
      >
        <svg viewBox="0 0 400 240" aria-hidden="true" focusable="false">
          <g className="friend-seat-ground">
            <ellipse cx="104" cy="218" rx="78" ry="9" />
            <ellipse cx="294" cy="218" rx="78" ry="9" />
          </g>
          <g className="friend-seat-lines">
            <path
              className="friend-seat-ink"
              d="M48 197v17h12l4-17m77 0 4 17h12v-17M237 197v17h12l4-17m78 0 4 17h12v-17"
            />
            <g className="friend-seat-purple">
              <rect x="49" y="91" width="111" height="103" rx="27" />
              <path d="M51 145v25h103v-25q0-14 14-14t14 14v42q0 15-15 15H44q-15 0-15-15v-42q0-14 11-14t11 14Z" />
              <path d="M55 172h98" fill="none" />
            </g>
            <g className="friend-seat-empty">
              <g className="friend-seat-lime">
                <rect x="239" y="78" width="109" height="112" rx="25" />
                <path d="M239 145v39h108v-39q0-14 13-14t13 14v42q0 15-15 15H230q-15 0-15-15v-42q0-14 12-14t12 14Z" />
                <path d="M244 185h98" fill="none" />
              </g>
            </g>
            <g className="friend-seat-person">
              <path
                className="friend-seat-purple"
                d="M87 110q17-9 34 0 17 9 19 35l-12 19H80l-13-19q3-26 20-35Z"
              />
              <path className="friend-seat-cream" d="M95 101v12q9 9 18 0v-12" />
              <path
                className="friend-seat-ink"
                d="M78 152q26 9 52 0 9 2 7 14l-7 34h-18l4-30H93l-6 30H69l1-34q0-12 8-14Z"
              />
              <path
                className="friend-seat-ink"
                d="m69 198 18 1-1 12H58q-4-7 11-13Zm43 1 18-1q16 5 15 13h-32Z"
              />
              <path
                className="friend-seat-purple"
                d="M82 121q-14 7-17 20-2 9 7 12l13-9-2-10m43-13q14 7 17 20 2 9-7 12l-13-9 2-10"
              />
              <path
                className="friend-seat-cream"
                transform="translate(-10 1) rotate(12 85 153)"
                d="M82 142q7-3 12 3l6 9q3 5-1 7-3 1-7-6l3 8q0 5-4 4l-6-10 3 8q-2 5-6 1l-5-10q-3-9 5-14Z"
              />
              <path
                className="friend-seat-cream"
                transform="translate(10 1) rotate(-12 123 153)"
                d="M126 142q-7-3-12 3l-6 9q-3 5 1 7 3 1 7-6l-3 8q0 5 4 4l6-10-3 8q2 5 6 1l5-10q3-9-5-14Z"
              />
              <g className="friend-seat-head">
                <path
                  className="friend-seat-cream"
                  d="M74 69q-9-4-10 4-1 9 10 10 5 22 30 24 25-2 30-24 11-1 10-10-1-8-10-4l-2-16H76Z"
                />
                <path
                  className="friend-seat-ink"
                  d="M73 72q-5-10-2-18-3-13 9-16 3-12 15-10 9-9 20-1 14-3 17 8 12 4 9 16-1 10-8 15l-6-17q-9 9-18 4-9 8-24 3l-5 16Z"
                />
                <g className="friend-seat-eyes">
                  <circle cx="90" cy="77" r="2.5" stroke="none" className="friend-seat-ink" />
                  <circle cx="118" cy="77" r="2.5" stroke="none" className="friend-seat-ink" />
                </g>
                <path d="M97 90q7 7 14 0" fill="none" />
              </g>
            </g>
            <g className="friend-seat-plus-shadow friend-seat-ink" transform="translate(0 -20)">
              <circle cx="348" cy="103" r="24" />
            </g>
            <g transform="translate(0 -20)">
              <g className="friend-seat-plus">
                <circle className="friend-seat-coral" cx="344" cy="98" r="24" />
                <path d="M344 89v18m-9-9h18" fill="none" />
              </g>
            </g>
            <path
              className="friend-seat-sparks"
              transform="translate(0 -20)"
              d="m322 62-5-8m28 4 2-10m20 17 7-6"
              fill="none"
            />
          </g>
        </svg>
        <span className="friend-seat-label" aria-hidden="true">
          Invite
          <br />
          first
          <br />
          friend
        </span>
      </button>
      {inviteOpen ? <InvitePartnerPanel onClose={() => setInviteOpen(false)} /> : null}
    </>
  )
}
