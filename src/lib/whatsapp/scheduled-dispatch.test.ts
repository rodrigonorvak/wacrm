import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchScheduledMessages } from './scheduled-dispatch';

const mocks = vi.hoisted(() => ({ send: vi.fn(), decrypt: vi.fn() }));
vi.mock('./send-message', () => ({ sendMessageToConversation: mocks.send }));
vi.mock('./encryption', () => ({ decrypt: mocks.decrypt }));

const schedule = {
  id: 'schedule', account_id: 'account', contact_id: 'contact',
  template_id: 'template', created_by: 'user',
  variables: { body: [{ source: 'contact_name' }] },
};
const template = {
  id: 'template', user_id: 'user', name: 'reminder', language: 'pt_BR',
  body_text: 'Olá {{1}}', status: 'APPROVED', meta_template_id: 'meta-id',
};

function database(overrides: { status?: string; claimed?: boolean; missingContact?: boolean } = {}) {
  const updates: Record<string, unknown>[] = [];
  let claims = 0;
  const db = {
    rpc: vi.fn(async () => ({ data: claims++ === 0 && overrides.claimed !== false ? [schedule] : [], error: null })),
    from: vi.fn((table: string) => {
      let action = '';
      let update: Record<string, unknown> = {};
      const builder = {
        select: vi.fn(() => builder),
        update: vi.fn((value: Record<string, unknown>) => { action = 'update'; update = value; return builder; }),
        insert: vi.fn(() => { action = 'insert'; return builder; }),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        lt: vi.fn(async () => ({ data: null, error: null })),
        single: vi.fn(async () => ({ data: { id: 'conversation' }, error: null })),
        maybeSingle: vi.fn(async () => {
          if (table === 'scheduled_whatsapp_messages' && action === 'update') {
            updates.push(update);
            return { data: { id: 'schedule' }, error: null };
          }
          if (table === 'contacts') return { data: overrides.missingContact ? null : { id: 'contact', name: 'Maria', phone: '5511999999999' }, error: null };
          if (table === 'message_templates') return { data: { ...template, status: overrides.status ?? 'APPROVED' }, error: null };
          if (table === 'whatsapp_config') return { data: { access_token: 'encrypted' }, error: null };
          return { data: { id: 'conversation' }, error: null };
        }),
      };
      return builder;
    }),
  };
  return { db: db as unknown as SupabaseClient, updates };
}

describe('scheduled message dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decrypt.mockReturnValue('token');
    mocks.send.mockResolvedValue({ whatsappMessageId: 'wamid' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ id: 'meta-id', status: 'APPROVED' }),
    }));
  });

  it('claims once, checks Meta approval, resolves the contact name and records success', async () => {
    const { db, updates } = database();
    expect(await dispatchScheduledMessages(db)).toBe(1);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][2]).toMatchObject({
      automated: true, templateMessageParams: { body: ['Maria'] }, resolvedTemplate: { id: 'template' },
    });
    expect(updates).toContainEqual(expect.objectContaining({ status: 'sent', whatsapp_message_id: 'wamid' }));
  });

  it('does not send if the local model is no longer approved', async () => {
    const { db, updates } = database({ status: 'PAUSED' });
    await dispatchScheduledMessages(db);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ status: 'failed' }));
  });

  it('does not send when Meta cannot confirm approval', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'meta-id', status: 'PAUSED' }) } as Response);
    const { db, updates } = database();
    await dispatchScheduledMessages(db);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ status: 'failed', error_code: 'template_not_approved' }));
  });

  it('marks an ambiguous send as uncertain and does not retry', async () => {
    mocks.send.mockRejectedValueOnce(new Error('timeout'));
    const { db, updates } = database();
    await dispatchScheduledMessages(db);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(updates).toContainEqual(expect.objectContaining({ status: 'uncertain', error_code: 'send_unconfirmed' }));
  });

  it('marks missing contact as failed without calling Meta', async () => {
    const { db, updates } = database({ missingContact: true });
    await dispatchScheduledMessages(db);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ status: 'failed' }));
  });
});
