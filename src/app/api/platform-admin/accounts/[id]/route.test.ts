import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  supabaseAdmin: vi.fn(),
  filters: [] as { table: string; column: string; value: unknown }[],
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

const ACCOUNT_ID = '11111111-2222-4333-8444-555555555555'

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      mocks.filters.push({ table, column, value })
      return query
    }),
    order: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === 'accounts') return { data: { id: ACCOUNT_ID, name: 'Acme', owner_user_id: 'owner-1', created_at: '2026-01-01', updated_at: '2026-02-01' }, error: null }
      if (table === 'whatsapp_config') return { data: { status: 'connected', connected_at: '2026-02-01', registered_at: null, last_registration_error: 'secret-looking raw error' }, error: null }
      return { data: null, error: null }
    }),
    then: (resolve: (value: unknown) => unknown) => {
      const result = table === 'profiles'
        ? { data: [{ user_id: 'owner-1', full_name: 'Owner', email: 'owner@example.com', account_role: 'owner', created_at: '2026-01-01' }], count: 1, error: null }
        : table === 'meta_integrations'
          ? { data: [{ source_type: 'elementor', is_active: true, last_tested_at: '2026-02-01', last_event_at: null, last_error: 'private integration error' }], count: 1, error: null }
          : { data: null, count: table === 'contacts' ? 12 : 7, error: null }
      return Promise.resolve(result as unknown).then(resolve)
    },
  }
  return query
}

beforeEach(() => {
  mocks.requirePlatformAdmin.mockReset().mockResolvedValue({ role: 'super_admin' })
  mocks.filters.length = 0
  mocks.supabaseAdmin.mockReset().mockReturnValue({ from: vi.fn((table: string) => makeQuery(table)) })
})

describe('GET /api/platform-admin/accounts/[id]', () => {
  it('returns member, integration health flags, and aggregate counts without raw errors', async () => {
    const response = await GET(new Request('https://crm.example/api/platform-admin/accounts'), {
      params: Promise.resolve({ id: ACCOUNT_ID }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.members[0]).toMatchObject({ email: 'owner@example.com', role: 'owner' })
    expect(body.integrations.whatsapp).toMatchObject({ status: 'connected', has_error: true, registered: false })
    expect(body.integrations.meta[0]).toMatchObject({ source_type: 'elementor', active: true, has_error: true })
    expect(body.usage_summary).toEqual({ contacts: 12, conversations: 7 })
    expect(JSON.stringify(body)).not.toContain('secret-looking raw error')
    expect(JSON.stringify(body)).not.toContain('private integration error')
    expect(mocks.filters.every((filter) => filter.value === ACCOUNT_ID)).toBe(true)
  })

  it('rejects invalid ids and non-super-admin roles before querying the database', async () => {
    const invalid = await GET(new Request('https://crm.example'), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })
    expect(invalid.status).toBe(404)
    expect(mocks.supabaseAdmin).not.toHaveBeenCalled()

    mocks.requirePlatformAdmin.mockResolvedValue({ role: 'support' })
    const denied = await GET(new Request('https://crm.example'), {
      params: Promise.resolve({ id: ACCOUNT_ID }),
    })
    expect(denied.status).toBe(403)
    expect(mocks.supabaseAdmin).not.toHaveBeenCalled()
  })
})
