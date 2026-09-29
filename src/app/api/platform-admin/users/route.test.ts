import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  listUsers: vi.fn(),
  profiles: [] as Record<string, unknown>[],
  accounts: [] as Record<string, unknown>[],
  fromCalls: [] as string[],
}))

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}))
vi.mock('@/lib/auth/account', () => ({
  toErrorResponse: vi.fn(() => Response.json({ error: 'forbidden' }, { status: 403 })),
}))
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    auth: { admin: { listUsers: mocks.listUsers } },
    from: (table: string) => {
      mocks.fromCalls.push(table)
      const rows = table === 'profiles' ? mocks.profiles : mocks.accounts
      const query = {
        select: vi.fn(() => query),
        in: vi.fn(() => query),
        then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      }
      return query
    },
  }),
}))

import { GET } from './route'

beforeEach(() => {
  mocks.requirePlatformAdmin.mockReset().mockResolvedValue({ role: 'super_admin' })
  mocks.listUsers.mockReset().mockResolvedValue({
    data: {
      users: [
        {
          id: 'user-1',
          email: 'owner@example.com',
          created_at: '2026-01-01T00:00:00Z',
          last_sign_in_at: '2026-02-01T00:00:00Z',
          email_confirmed_at: '2026-01-01T00:00:00Z',
          banned_until: null,
          user_metadata: { private_note: 'must not leak' },
          app_metadata: { secret_flag: 'must not leak' },
        },
        {
          id: 'user-2',
          email: 'unlinked@example.com',
          created_at: '2026-01-02T00:00:00Z',
          user_metadata: { access_token: 'must not leak' },
          app_metadata: {},
        },
      ],
    },
    error: null,
  })
  mocks.profiles = [{
    user_id: 'user-1',
    full_name: 'Account Owner',
    account_id: 'account-1',
    account_role: 'owner',
  }]
  mocks.accounts = [{ id: 'account-1', name: 'Acme CRM' }]
  mocks.fromCalls.length = 0
})

describe('GET /api/platform-admin/users', () => {
  it('returns minimal auth and tenant fields, including users without a profile', async () => {
    const response = await GET(new Request('https://crm.example/api/platform-admin/users?page=2'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.listUsers).toHaveBeenCalledWith({ page: 2, perPage: 50 })
    expect(body.users[0]).toMatchObject({
      id: 'user-1',
      email: 'owner@example.com',
      full_name: 'Account Owner',
      account_name: 'Acme CRM',
      account_role: 'owner',
      last_sign_in_at: '2026-02-01T00:00:00Z',
      email_confirmed: true,
      access_status: 'enabled',
    })
    expect(body.users[1]).toMatchObject({
      email: 'unlinked@example.com',
      account_id: null,
      account_name: null,
      account_role: null,
    })
    expect(JSON.stringify(body)).not.toContain('must not leak')
    expect(JSON.stringify(body)).not.toContain('access_token')
  })

  it('requires super_admin and rejects invalid page numbers before listing Auth users', async () => {
    const invalidPage = await GET(new Request('https://crm.example/api/platform-admin/users?page=0'))
    expect(invalidPage.status).toBe(400)
    expect(mocks.listUsers).not.toHaveBeenCalled()

    mocks.requirePlatformAdmin.mockResolvedValue({ role: 'support' })
    const support = await GET(new Request('https://crm.example/api/platform-admin/users'))
    expect(support.status).toBe(403)
    expect(mocks.listUsers).not.toHaveBeenCalled()
  })
})
