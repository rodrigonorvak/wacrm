import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  supabaseAdmin: vi.fn(),
  accountRows: [] as Record<string, unknown>[],
  profileRows: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}))
vi.mock('@/lib/auth/account', () => ({
  toErrorResponse: vi.fn(() => Response.json({ error: 'forbidden' }, { status: 403 })),
}))
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

import { GET } from './route'

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    in: vi.fn(() => query),
    then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
      Promise.resolve({
        data: table === 'accounts' ? mocks.accountRows : mocks.profileRows,
        error: null,
      }).then(resolve),
  }
  return query
}

beforeEach(() => {
  mocks.requirePlatformAdmin.mockReset().mockResolvedValue({
    userId: 'platform-admin-1',
    role: 'super_admin',
  })
  mocks.accountRows = [{
    id: 'account-1',
    name: 'Acme CRM',
    owner_user_id: 'owner-1',
    created_at: '2026-01-01T00:00:00Z',
  }]
  mocks.profileRows = [
    {
      user_id: 'owner-1',
      account_id: 'account-1',
      full_name: 'Account Owner',
      email: 'owner@example.com',
      account_role: 'owner',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      user_id: 'agent-1',
      account_id: 'account-1',
      full_name: 'Agent',
      email: 'agent@example.com',
      account_role: 'agent',
      created_at: '2026-01-02T00:00:00Z',
    },
  ]
  mocks.supabaseAdmin.mockReturnValue({
    from: vi.fn((table: string) => makeQuery(table)),
  })
})

describe('GET /api/platform-admin/accounts', () => {
  it('requires a platform admin before reading global account data', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(new Error('forbidden'))

    const response = await GET()

    expect(response.status).toBe(403)
    expect(mocks.supabaseAdmin).not.toHaveBeenCalled()
  })

  it('does not expose account owner emails to support or billing roles', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      userId: 'platform-support-1',
      role: 'support',
    })

    const response = await GET()

    expect(response.status).toBe(403)
    expect(mocks.supabaseAdmin).not.toHaveBeenCalled()
  })

  it('lists account owner identity and member count without exposing full member records', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.accounts).toEqual([{
      id: 'account-1',
      name: 'Acme CRM',
      created_at: '2026-01-01T00:00:00Z',
      member_count: 2,
      owner: {
        user_id: 'owner-1',
        full_name: 'Account Owner',
        email: 'owner@example.com',
      },
    }])
    expect(JSON.stringify(body)).not.toContain('agent@example.com')
  })
})
