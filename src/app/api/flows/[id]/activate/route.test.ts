import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  supabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}))
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

import { POST } from './route'

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
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'flow-1' }, error: null }),
          })),
        })),
      })),
    })),
  },
}

beforeEach(() => {
  mocks.requireRole.mockReset().mockResolvedValue(accountContext)
})

describe('flow activation tenant scoping', () => {
  it('validates and updates a flow within the current account', async () => {
    const adminFilters: [string, unknown][] = []
    const query = {
      update: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        adminFilters.push([column, value])
        return query
      }),
      select: vi.fn(() => query),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'flow-1' }, error: null }),
    }
    mocks.supabaseAdmin.mockReturnValue({ from: vi.fn(() => query) })

    const response = await POST(
      new Request('http://localhost/api/flows/flow-1/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      }),
      { params: Promise.resolve({ id: 'flow-1' }) },
    )

    expect(response.status).toBe(200)
    expect(adminFilters).toContainEqual(['id', 'flow-1'])
    expect(adminFilters).toContainEqual(['account_id', 'account-current'])
  })
})
