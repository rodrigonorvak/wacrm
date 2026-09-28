import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  supabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.getCurrentAccount,
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}))
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

import { DELETE } from './route'

const accountContext = {
  userId: 'user-current',
  accountId: 'account-current',
  role: 'agent',
  account: { id: 'account-current', name: 'Current account' },
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'flow-current' }, error: null }),
          })),
        })),
      })),
    })),
  },
}

beforeEach(() => {
  mocks.getCurrentAccount.mockReset().mockResolvedValue(accountContext)
  mocks.requireRole.mockReset().mockResolvedValue(accountContext)
})

describe('flow detail route tenant scoping', () => {
  it('includes the current account in service-role deletion filters', async () => {
    const filters: [string, unknown][] = []
    const query = {
      delete: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value])
        return query
      }),
      then: (resolve: (value: { error: null }) => unknown) =>
        Promise.resolve({ error: null }).then(resolve),
    }
    mocks.supabaseAdmin.mockReturnValue({ from: vi.fn(() => query) })

    const response = await DELETE(
      new Request('http://localhost/api/flows/flow-current'),
      { params: Promise.resolve({ id: 'flow-current' }) },
    )

    expect(response.status).toBe(200)
    expect(filters).toContainEqual(['id', 'flow-current'])
    expect(filters).toContainEqual(['account_id', 'account-current'])
  })
})
