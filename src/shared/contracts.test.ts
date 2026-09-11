import { describe, expect, it } from 'vitest'

import { invitePartnerSchema, updateProfileSchema, usernameSchema } from './contracts'

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

  it('validates an invitation', () => {
    expect(invitePartnerSchema.parse({ username: 'Partner_1' })).toEqual({
      username: 'partner_1',
    })
  })
})
