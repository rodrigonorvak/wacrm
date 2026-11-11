import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: vi.fn(), update: vi.fn(), eq: vi.fn(), result: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => {
      const builder = {
        update: (value: unknown) => { mocks.update(value); return builder; },
        eq: (key: string, value: string) => { mocks.eq(key, value); return builder; },
        select: () => builder,
        maybeSingle: mocks.result,
      };
      return builder;
    },
  }),
}));

import { DELETE } from './route';

const request = new Request('http://localhost/api/whatsapp/scheduled-messages/schedule', { method: 'DELETE' });
const params = { params: Promise.resolve({ id: 'schedule' }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'account' });
  mocks.result.mockResolvedValue({ data: { id: 'schedule' }, error: null });
});

describe('DELETE scheduled message', () => {
  it('only cancels pending messages in the authenticated account', async () => {
    expect((await DELETE(request, params)).status).toBe(200);
    expect(mocks.role).toHaveBeenCalledWith('agent');
    expect(mocks.eq.mock.calls).toEqual([
      ['account_id', 'account'], ['id', 'schedule'], ['status', 'pending'],
    ]);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });
  it('rejects unauthorized users and already claimed or missing schedules', async () => {
    mocks.role.mockRejectedValueOnce(new Error('forbidden'));
    expect((await DELETE(request, params)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.result.mockResolvedValueOnce({ data: null, error: null });
    expect((await DELETE(request, params)).status).toBe(409);
  });
});
