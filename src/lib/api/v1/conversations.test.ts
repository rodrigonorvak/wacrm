import { describe, it, expect } from 'vitest';
import type { Conversation, Message } from '@/types';
import { serializeConversation, serializeMessage } from './conversations';

describe('serializeConversation', () => {
  it('projects public fields + nested contact/tags and drops internals', () => {
    const conv = {
      id: 'conv1',
      user_id: 'internal-user',
      account_id: 'internal-acct',
      contact_id: 'c1',
      status: 'open',
      last_message_text: 'hi',
      last_message_at: '2026-01-01T00:00:00Z',
      unread_count: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      contact: {
        id: 'c1',
        phone: '+1',
        name: 'Jane',
        tags: [{ id: 't1', name: 'vip', color: '#fff' }],
      },
    } as unknown as Conversation;

    const out = serializeConversation(conv);
    expect(out).not.toHaveProperty('user_id');
    expect(out).not.toHaveProperty('account_id');
    expect(out.contact?.tags).toEqual([{ id: 't1', name: 'vip', color: '#fff' }]);
    expect(out.unread_count).toBe(2);
  });

  it('omits nested tags that do not belong to the API key account', () => {
    const conv = {
      id: 'conv2',
      contact_id: 'c2',
      status: 'open',
      created_at: 'a',
      updated_at: 'b',
      contact: {
        id: 'c2',
        phone: '+1',
        tags: [
          { id: 't1', name: 'own', color: '#fff', account_id: 'account-a' },
          { id: 't2', name: 'foreign', color: '#000', account_id: 'account-b' },
        ],
      },
    } as unknown as Conversation;

    expect(serializeConversation(conv, 'account-a').contact?.tags).toEqual([
      { id: 't1', name: 'own', color: '#fff' },
    ]);
  });
});

describe('serializeMessage', () => {
  it('maps message_id → whatsapp_message_id and derives direction', () => {
    const inbound = {
      id: 'm1',
      conversation_id: 'conv1',
      sender_type: 'customer',
      content_type: 'text',
      content_text: 'hello',
      message_id: 'wamid.123',
      status: 'delivered',
      created_at: '2026-01-01T00:00:00Z',
    } as unknown as Message;
    const outMsg = serializeMessage(inbound);
    expect(outMsg.direction).toBe('inbound');
    expect(outMsg.whatsapp_message_id).toBe('wamid.123');
    expect(outMsg).not.toHaveProperty('message_id');

    const agent = { ...inbound, sender_type: 'agent' } as unknown as Message;
    expect(serializeMessage(agent).direction).toBe('outbound');
  });
});
