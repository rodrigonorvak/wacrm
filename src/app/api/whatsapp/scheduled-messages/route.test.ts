import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: vi.fn(), insert: vi.fn(), lookups: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      insert: mocks.insert,
    }),
  }),
}));

import { POST } from './route';

const template = {
  id: 'template', user_id: 'user', name: 'reminder', category: 'Utility',
  body_text: 'Olá {{1}}', status: 'APPROVED', meta_template_id: 'meta-id',
};
const payload = {
  contact_id: 'contact', template_id: 'template', label: 'Retorno',
  scheduled_at: '2099-01-01T10:00:00.000Z',
  variables: { body: [{ source: 'contact_name' }] },
};
function request(body: unknown = payload) {
  return new Request('http://localhost/api/whatsapp/scheduled-messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
function lookup(data: unknown) {
  const builder = {
    select: () => builder,
    eq: (key: string, value: string) => { mocks.lookups(key, value); return builder; },
    maybeSingle: async () => ({ data, error: null }),
  };
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({
    accountId: 'account', userId: 'user',
    supabase: { from: (table: string) => lookup(table === 'contacts' ? { id: 'contact', name: 'Ana', phone: '5511999999999' } : template) },
  });
  mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'new-id' }, error: null }) }) });
});

describe('POST scheduled messages', () => {
  it('requires an agent and inserts only resources belonging to their account', async () => {
    expect((await POST(request())).status).toBe(201);
    expect(mocks.role).toHaveBeenCalledWith('agent');
    expect(mocks.lookups.mock.calls.filter(([key]) => key === 'account_id')).toEqual([
      ['account_id', 'account'], ['account_id', 'account'],
    ]);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      account_id: 'account', contact_id: 'contact', template_id: 'template',
    }));
  });
  it('rejects unauthorized users before accessing the service client', async () => {
    mocks.role.mockRejectedValueOnce(new Error('forbidden'));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('rejects dates in the past or with seconds', async () => {
    expect((await POST(request({ ...payload, scheduled_at: '2020-01-01T10:00:00.000Z' }))).status).toBe(400);
    expect((await POST(request({ ...payload, scheduled_at: '2099-01-01T10:00:02.000Z' }))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('maps simultaneous-slot database conflicts to 409', async () => {
    mocks.insert.mockReturnValueOnce({ select: () => ({ single: async () => ({ data: null, error: { code: '23505' } }) }) });
    expect((await POST(request())).status).toBe(409);
  });
  it('rejects unapproved templates and missing variable values', async () => {
    mocks.role.mockResolvedValueOnce({
      accountId: 'account', userId: 'user',
      supabase: { from: (table: string) => lookup(table === 'contacts' ? { name: 'Ana', phone: '55' } : { ...template, status: 'PENDING' }) },
    });
    expect((await POST(request())).status).toBe(400);
    expect((await POST(request({ ...payload, variables: { body: [] } }))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
