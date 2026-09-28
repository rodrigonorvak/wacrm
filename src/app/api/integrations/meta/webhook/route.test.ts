import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  findOrCreateContact: vi.fn(),
  resolveAuditUserId: vi.fn(),
  sendMetaEvent: vi.fn(),
}))

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))
vi.mock('@/lib/api/v1/contacts', () => ({
  findOrCreateContact: mocks.findOrCreateContact,
  resolveAuditUserId: mocks.resolveAuditUserId,
}))
vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: vi.fn((value: string) => value) }))
vi.mock('@/lib/whatsapp/webhook-signature', () => ({
  verifyMetaWebhookSignature: vi.fn(() => true),
}))
vi.mock('@/lib/integrations/meta-events', () => ({
  sendMetaEvent: mocks.sendMetaEvent,
}))

import { POST } from './route'

interface DbCall {
  table: string
  action?: 'insert' | 'update' | 'upsert'
  payload?: unknown
  filters: [string, unknown][]
}

const integration = {
  id: 'integration-1',
  account_id: 'account-1',
  pipeline_id: 'pipeline-1',
  api_version: 'v25.0',
  page_access_token_encrypted: 'encrypted-token',
  is_active: true,
}

function makeDatabase() {
  const calls: DbCall[] = []
  const database = {
    from(table: string) {
      const call: DbCall = { table, filters: [] }
      calls.push(call)
      const query: Record<string, (...args: unknown[]) => unknown> = {}
      query.select = () => query
      query.eq = (column: unknown, value: unknown) => {
        call.filters.push([String(column), value])
        return query
      }
      query.order = () => query
      query.limit = () => query
      query.insert = (payload: unknown) => {
        call.action = 'insert'
        call.payload = payload
        return query
      }
      query.update = (payload: unknown) => {
        call.action = 'update'
        call.payload = payload
        return query
      }
      query.upsert = (payload: unknown) => {
        call.action = 'upsert'
        call.payload = payload
        return query
      }
      query.maybeSingle = async () => {
        if (table === 'meta_integrations') return { data: integration, error: null }
        if (table === 'custom_fields') return { data: { id: 'custom-field-1' }, error: null }
        return { data: null, error: null }
      }
      query.single = async () => {
        if (table === 'lead_integration_events') {
          return { data: { id: 'event-1' }, error: null }
        }
        if (table === 'pipeline_stages') {
          return { data: { id: 'stage-1' }, error: null }
        }
        if (table === 'deals') {
          return { data: { id: 'deal-1', stage_id: 'stage-1' }, error: null }
        }
        return { data: null, error: null }
      }
      query.then = (...args: unknown[]) =>
        Promise.resolve({ data: null, error: null }).then(
          args[0] as (value: { data: null; error: null }) => unknown,
        )
      return query
    },
  }
  return { database, calls }
}

beforeEach(() => {
  const { database, calls } = makeDatabase()
  mocks.supabaseAdmin.mockReset().mockReturnValue(database)
  mocks.findOrCreateContact.mockReset().mockResolvedValue({ id: 'contact-1' })
  mocks.resolveAuditUserId.mockReset().mockResolvedValue('audit-user-1')
  mocks.sendMetaEvent.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'lead-1',
        field_data: [
          { name: 'full_name', values: ['Test Contact'] },
          { name: 'phone_number', values: ['+5511999999999'] },
        ],
      }),
    }),
  )
  testCalls = calls
})

let testCalls: DbCall[] = []

describe('Meta Instant Form webhook tenant scoping', () => {
  it('resolves the page integration and writes lead data only to its account', async () => {
    const response = await POST(
      new Request('http://localhost/api/integrations/meta/webhook', {
        method: 'POST',
        body: JSON.stringify({
          entry: [
            {
              id: 'meta-page-1',
              changes: [
                {
                  field: 'leadgen',
                  value: { leadgen_id: 'lead-1', form_id: 'form-1' },
                },
              ],
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(200)
    const integrationLookup = testCalls.find((call) => call.table === 'meta_integrations')
    expect(integrationLookup?.filters).toContainEqual(['meta_page_id', 'meta-page-1'])
    expect(integrationLookup?.filters).toContainEqual(['is_active', true])
    expect(mocks.findOrCreateContact).toHaveBeenCalledWith(
      expect.anything(),
      'account-1',
      'audit-user-1',
      expect.objectContaining({ name: 'Test Contact' }),
    )

    const dealInsert = testCalls.find((call) => call.table === 'deals' && call.action === 'insert')
    expect(dealInsert?.payload).toEqual(
      expect.objectContaining({ account_id: 'account-1', pipeline_id: 'pipeline-1' }),
    )
    expect(mocks.sendMetaEvent).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-1', pipelineId: 'pipeline-1' }),
    )
  })
})
