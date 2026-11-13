import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  adminRow: vi.fn(),
  supportAdmin: { role: 'super_admin', active: true } as { role: string; active: boolean },
  supportSession: { id: 'session-1', account_id: 'account-1', expires_at: '2026-11-13T15:00:00Z' } as {
    id: string; account_id: string; expires_at: string;
  } | null,
  supportAccountDeleted: false,
}))

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        gt: () => query,
        maybeSingle: async () => ({
          data: table === 'platform_admins'
            ? mocks.supportAdmin
            : table === 'platform_admin_account_sessions'
              ? mocks.supportSession
              : { id: 'account-1', name: 'Customer account', deleted_at: mocks.supportAccountDeleted ? '2026-01-01' : null },
          error: null,
        }),
      }
      return query
    },
  }),
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
import { getPlatformAdminSupportSession, requirePlatformAdmin } from './platform-admin'

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({
    data: { user: { id: 'platform-user-1' } },
    error: null,
  })
  mocks.adminRow.mockReset().mockResolvedValue({
    data: { role: 'super_admin', active: true },
    error: null,
  })
  mocks.supportAdmin = { role: 'super_admin', active: true }
  mocks.supportSession = { id: 'session-1', account_id: 'account-1', expires_at: '2026-11-13T15:00:00Z' }
  mocks.supportAccountDeleted = false
})

describe('getPlatformAdminSupportSession', () => {
  it('returns only the active account and session summary for a super administrator', async () => {
    await expect(getPlatformAdminSupportSession('platform-user-1')).resolves.toEqual({
      id: 'session-1',
      accountId: 'account-1',
      accountName: 'Customer account',
      expiresAt: '2026-11-13T15:00:00Z',
    })
  })

  it('does not trust an active session row after the platform role is revoked', async () => {
    mocks.supportAdmin = { role: 'support', active: true }
    await expect(getPlatformAdminSupportSession('platform-user-1')).resolves.toBeNull()
  })

  it('does not return access to a deleted account', async () => {
    mocks.supportAccountDeleted = true
    await expect(getPlatformAdminSupportSession('platform-user-1')).resolves.toBeNull()
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
