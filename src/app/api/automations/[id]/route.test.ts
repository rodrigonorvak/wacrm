import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  getPlatformAdminSupportSession: vi.fn(),
  supabaseAdmin: vi.fn(),
  loadStepsTree: vi.fn(),
  replaceSteps: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-removed-from-old-account' } } }) },
  }),
}))

vi.mock('@/lib/auth/platform-admin', () => ({
  getPlatformAdminSupportSession: mocks.getPlatformAdminSupportSession,
}))

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.getCurrentAccount,
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}))

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

vi.mock('@/lib/automations/steps-tree', () => ({
  loadStepsTree: mocks.loadStepsTree,
  replaceSteps: mocks.replaceSteps,
}))

vi.mock('@/lib/automations/validate', () => ({
  validateStepsForActivation: vi.fn(() => []),
  validateTriggerForActivation: vi.fn(() => []),
}))

import { DELETE, GET, PATCH } from './route'
import { POST as duplicate } from './duplicate/route'

const accountContext = {
  supabase: {},
  accountId: 'account-new',
  userId: 'user-removed-from-old-account',
  role: 'agent',
  account: { id: 'account-new', name: 'New account' },
}

const params = { params: Promise.resolve({ id: 'automation-from-old-account' }) }
const calls: { table: string; filters: [string, unknown][]; mutations: string[] }[] = []

function makeAdminClient() {
  return {
    from(table: string) {
      const call = { table, filters: [] as [string, unknown][], mutations: [] as string[] }
      calls.push(call)
      let selected = ''
      const query: Record<string, (...args: unknown[]) => unknown> = {}
      query.select = vi.fn((columns?: unknown) => {
        selected = String(columns ?? '')
        return query
      })
      query.eq = vi.fn((column: unknown, value: unknown) => {
        call.filters.push([String(column), value])
        return query
      })
      query.update = vi.fn(() => {
        call.mutations.push('update')
        return query
      })
      query.delete = vi.fn(() => {
        call.mutations.push('delete')
        return query
      })
      query.insert = vi.fn(() => {
        call.mutations.push('insert')
        return query
      })
      query.maybeSingle = vi.fn(async () => ({
        data: table === 'automations' && selected === 'id, is_active, user_id'
          ? { id: 'automation-from-old-account', is_active: false, user_id: 'user-removed-from-old-account' }
          : null,
        error: null,
      }))
      query.single = vi.fn(async () => ({ data: null, error: null }))
      query.then = (...args: unknown[]) =>
        Promise.resolve({ data: null, error: null }).then(
          args[0] as (value: { data: null; error: null }) => unknown,
        )
      return query
    },
  }
}

beforeEach(() => {
  calls.length = 0
  mocks.getCurrentAccount.mockReset().mockResolvedValue(accountContext)
  mocks.requireRole.mockReset().mockResolvedValue(accountContext)
  mocks.getPlatformAdminSupportSession.mockReset().mockResolvedValue(null)
  mocks.supabaseAdmin.mockReset().mockReturnValue(makeAdminClient())
  mocks.loadStepsTree.mockReset().mockResolvedValue([])
  mocks.replaceSteps.mockReset().mockResolvedValue(null)
})

describe('automation routes enforce the current tenant after member removal', () => {
  it('does not read an automation from the previous account', async () => {
    const response = await GET(new Request('http://localhost/api/automations/old'), params)

    expect(response.status).toBe(404)
    expect(calls[0].filters).toContainEqual(['account_id', 'account-new'])
  })

  it('does not edit an automation from the previous account', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/automations/old', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Changed' }),
      }),
      params,
    )

    expect(response.status).toBe(404)
    expect(calls[0].filters).toContainEqual(['account_id', 'account-new'])
    expect(calls.flatMap((call) => call.mutations)).not.toContain('update')
  })

  it('scopes deletion to the current account and user', async () => {
    const response = await DELETE(new Request('http://localhost/api/automations/old'), params)

    expect(response.status).toBe(200)
    const deletion = calls.find((call) => call.mutations.includes('delete'))
    expect(deletion?.filters).toContainEqual(['account_id', 'account-new'])
    expect(deletion?.filters).toContainEqual(['user_id', 'user-removed-from-old-account'])
  })

  it('does not duplicate an automation from the previous account', async () => {
    const response = await duplicate(
      new Request('http://localhost/api/automations/old', { method: 'POST' }),
      params,
    )

    expect(response.status).toBe(404)
    expect(calls[0].filters).toContainEqual(['account_id', 'account-new'])
    expect(calls.flatMap((call) => call.mutations)).not.toContain('insert')
  })
})