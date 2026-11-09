import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  from: vi.fn(),
  logQuery: {} as Record<string, ReturnType<typeof vi.fn>>,
  automationQuery: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('@/lib/email-senders/access', () => ({ requireEmailSenderAdmin: mocks.requireAccess }));
vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock('@/lib/auth/account', () => ({
  toErrorResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
}));

import { GET } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAccess.mockResolvedValue({ accountId: 'account-1' });
  const logQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'contains', 'order']) {
    logQuery[method] = vi.fn(() => logQuery);
  }
  logQuery.range = vi.fn().mockResolvedValue({
    data: [{
      id: 'log-1', automation_id: 'automation-1', created_at: '2026-01-01T00:00:00Z',
      steps_executed: [{ step_id: 'step-1', step_type: 'send_email', status: 'success', detail: 'email sent to a@example.com' }],
    }],
    error: null,
  });
  const automationQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq']) {
    automationQuery[method] = vi.fn(() => automationQuery);
  }
  automationQuery.in = vi.fn().mockResolvedValue({ data: [{ id: 'automation-1', name: 'Welcome' }], error: null });
  mocks.logQuery = logQuery;
  mocks.automationQuery = automationQuery;
  mocks.from.mockImplementation((table: string) => table === 'automation_logs' ? logQuery : automationQuery);
});

describe('GET automation email history', () => {
  it('requires access and scopes logs and automations to the account', async () => {
    const response = await GET(new Request('http://localhost/api/email/automation-history?page=2'));
    expect(response.status).toBe(200);
    expect(mocks.requireAccess).toHaveBeenCalledOnce();
    expect(mocks.logQuery.eq).toHaveBeenCalledWith('account_id', 'account-1');
    expect(mocks.automationQuery.eq).toHaveBeenCalledWith('account_id', 'account-1');
    expect(mocks.logQuery.range).toHaveBeenCalledWith(20, 40);
    expect(await response.json()).toMatchObject({
      emails: [{ automation_name: 'Welcome', recipient: 'a@example.com', date_is_run_start: true }],
      hasMore: false,
    });
  });

  it('rejects unauthorized access and invalid pages before querying', async () => {
    mocks.requireAccess.mockRejectedValueOnce(new Error('forbidden'));
    expect((await GET(new Request('http://localhost/api/email/automation-history'))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect((await GET(new Request('http://localhost/api/email/automation-history?page=0'))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('reports database failures instead of returning an empty history', async () => {
    mocks.logQuery.range.mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await GET(new Request('http://localhost/api/email/automation-history'))).status).toBe(500);
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
