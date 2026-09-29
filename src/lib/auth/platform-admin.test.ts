import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  adminRow: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.adminRow }),
      }),
    }),
  }),
}))

import { ForbiddenError, UnauthorizedError } from './account'
import { requirePlatformAdmin } from './platform-admin'

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({
    data: { user: { id: 'platform-user-1' } },
    error: null,
  })
  mocks.adminRow.mockReset().mockResolvedValue({
    data: { role: 'super_admin', active: true },
    error: null,
  })
})

describe('requirePlatformAdmin', () => {
  it('returns the independent active platform role', async () => {
    await expect(requirePlatformAdmin()).resolves.toMatchObject({
      userId: 'platform-user-1',
      role: 'super_admin',
    })
  })

  it('rejects unauthenticated users', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(requirePlatformAdmin()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('rejects users without an active platform admin record', async () => {
    mocks.adminRow.mockResolvedValue({ data: { role: 'support', active: false }, error: null })

    await expect(requirePlatformAdmin()).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('rejects unknown platform roles', async () => {
    mocks.adminRow.mockResolvedValue({ data: { role: 'owner', active: true }, error: null })

    await expect(requirePlatformAdmin()).rejects.toBeInstanceOf(ForbiddenError)
  })
})
