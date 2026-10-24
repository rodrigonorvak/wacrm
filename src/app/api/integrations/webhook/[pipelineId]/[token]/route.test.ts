import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  hashLeadIntegrationToken: vi.fn(),
  processUniversalLeadEvent: vi.fn(),
  integration: {
    id: 'integration-1',
    account_id: 'account-1',
    pipeline_id: 'pipeline-1',
    provider: 'universal',
    source_label: 'Eduzz',
    is_active: true,
  },
  insertedEvent: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}));
vi.mock('@/lib/integrations/lead-token', () => ({
  hashLeadIntegrationToken: mocks.hashLeadIntegrationToken,
}));
vi.mock('@/lib/integrations/process-universal-lead', () => ({
  processUniversalLeadEvent: mocks.processUniversalLeadEvent,
}));

import { POST } from './route';

function makeDatabase() {
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.maybeSingle = async () => ({ data: mocks.integration, error: null });
  query.insert = (...args: unknown[]) => {
    mocks.insertedEvent = args[0] as Record<string, unknown>;
    return query;
  };
  query.single = async () => ({ data: { id: 'event-1' }, error: null });
  return { from: () => query };
}

beforeEach(() => {
  mocks.insertedEvent = null;
  mocks.supabaseAdmin.mockReset().mockReturnValue(makeDatabase());
  mocks.hashLeadIntegrationToken.mockReset().mockResolvedValue('hashed-token');
  mocks.processUniversalLeadEvent
    .mockReset()
    .mockResolvedValue('awaiting_mapping');
});

describe('universal webhook endpoint', () => {
  it('stores arbitrary nested payloads and acknowledges them before mapping', async () => {
    const payload = {
      data: { buyer: { name: 'Joana', email: 'joana@example.com' } },
      event: 'purchase.created',
      id: 'notification-123',
    };
    const response = await POST(
      new Request('http://localhost/api/integrations/webhook/pipeline/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      {
        params: Promise.resolve({
          pipelineId: 'pipeline-1',
          token: 'a'.repeat(32),
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      accepted: true,
      status: 'awaiting_mapping',
    });
    expect(mocks.insertedEvent).toMatchObject({
      integration_id: 'integration-1',
      external_event_id: 'notification-123',
      payload,
      status: 'received',
    });
  });

  it('accepts an empty verification ping and persists it', async () => {
    const response = await POST(
      new Request('http://localhost/api/integrations/webhook/pipeline/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '',
      }),
      {
        params: Promise.resolve({
          pipelineId: 'pipeline-1',
          token: 'a'.repeat(32),
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.insertedEvent?.payload).toEqual({});
  });
});
