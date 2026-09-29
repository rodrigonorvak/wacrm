import { describe, expect, it } from 'vitest'
import { parseNewMemberInput } from './member-provisioning'

describe('parseNewMemberInput', () => {
  it('normalizes email and accepts only non-owner account roles', () => {
    expect(parseNewMemberInput({
      email: '  Member@Example.com ',
      password: 'temporary-pass-123',
      full_name: ' Teammate ',
      role: 'agent',
    })).toEqual({
      ok: true,
      value: {
        email: 'member@example.com',
        password: 'temporary-pass-123',
        fullName: 'Teammate',
        role: 'agent',
      },
    })
    expect(parseNewMemberInput({ email: 'member@example.com', password: 'temporary-pass-123', role: 'owner' }).ok).toBe(false)
  })

  it('rejects malformed email, weak temporary password, and oversized name', () => {
    expect(parseNewMemberInput({ email: 'not-email', password: 'temporary-pass-123', role: 'agent' }).ok).toBe(false)
    expect(parseNewMemberInput({ email: 'member@example.com', password: 'short', role: 'agent' }).ok).toBe(false)
    expect(parseNewMemberInput({ email: 'member@example.com', password: 'temporary-pass-123', full_name: 'n'.repeat(121), role: 'agent' }).ok).toBe(false)
  })
})
