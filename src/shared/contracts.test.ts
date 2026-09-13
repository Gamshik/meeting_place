import { describe, expect, it } from 'vitest'

import {
  invitePartnerSchema,
  startWordGameSchema,
  timeZoneSchema,
  updateProfileSchema,
  usernameSchema,
} from './contracts'

describe('shared request schemas', () => {
  it('normalizes a username', () => {
    expect(usernameSchema.parse('  Martyna_7 ')).toBe('martyna_7')
  })

  it('rejects unsafe usernames', () => {
    expect(usernameSchema.safeParse('two words').success).toBe(false)
  })

  it('requires a profile change', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false)
  })

  it('accepts real IANA timezones and rejects invented ones', () => {
    expect(timeZoneSchema.safeParse('Europe/Minsk').success).toBe(true)
    expect(updateProfileSchema.safeParse({ timeZone: 'America/New_York' }).success).toBe(true)
    expect(timeZoneSchema.safeParse('VPN/Nowhere').success).toBe(false)
  })

  it('validates an invitation', () => {
    expect(invitePartnerSchema.parse({ username: 'Partner_1' })).toEqual({
      username: 'partner_1',
    })
  })

  it('accepts only supported word-game modes', () => {
    expect(startWordGameSchema.parse({ mode: 'live_call' })).toEqual({ mode: 'live_call' })
    expect(startWordGameSchema.safeParse({ mode: 'meeting' }).success).toBe(false)
  })
})
