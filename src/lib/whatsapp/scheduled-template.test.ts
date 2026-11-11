import { describe, expect, it } from 'vitest';
import type { MessageTemplate } from '@/types';
import { resolveScheduledTemplate } from './scheduled-template';

function template(overrides: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    id: 'template', user_id: 'user', name: 'reminder', category: 'Utility',
    body_text: 'Olá {{1}}, {{2}}', status: 'APPROVED',
    created_at: '2026-01-01T00:00:00Z', ...overrides,
  };
}

describe('resolveScheduledTemplate', () => {
  it('resolves contact names and custom text across template components', () => {
    const result = resolveScheduledTemplate(template({
      header_type: 'text', header_content: 'Olá {{1}}',
      buttons: [{ type: 'URL', text: 'Abrir', url: 'https://example.com/{{1}}' }],
    }), {
      body: [{ source: 'contact_name' }, { source: 'text', value: '  retorno  ' }],
      headerText: { source: 'contact_name' },
      buttonParams: { 0: { source: 'text', value: 'abc' } },
    }, 'Maria');
    expect(result).toEqual({ body: ['Maria', 'retorno'], headerText: 'Maria', buttonParams: { 0: 'abc' } });
  });

  it('rejects an unapproved or subsequently revoked template', () => {
    expect(() => resolveScheduledTemplate(template({ status: 'PENDING' }), { body: [] }, 'Maria'))
      .toThrow('Somente modelos aprovados');
  });

  it('rejects missing contact names and invalid custom values', () => {
    const variables = { body: [{ source: 'contact_name' }, { source: 'text', value: 'x' }] };
    expect(() => resolveScheduledTemplate(template(), variables, '  ')).toThrow('Preencha');
    expect(() => resolveScheduledTemplate(template(), { body: [{ source: 'text', value: '' }, { source: 'text', value: 'x' }] }, 'Maria')).toThrow('Preencha');
  });

  it('rejects template changes and unexpected variable mappings', () => {
    expect(() => resolveScheduledTemplate(template(), { body: [] }, 'Maria')).toThrow('não correspondem');
    expect(() => resolveScheduledTemplate(template({ body_text: '{{2}}' }), { body: [{ source: 'contact_name' }] }, 'Maria')).toThrow('inválidas');
    expect(() => resolveScheduledTemplate(template({ body_text: 'Oi' }), { body: [], buttonParams: { 0: { source: 'text', value: 'x' } } }, 'Maria')).toThrow('botões');
  });

  it('rejects a media header without a usable send-time URL', () => {
    expect(() => resolveScheduledTemplate(template({ body_text: 'Oi', header_type: 'image' }), { body: [] }, 'Maria'))
      .toThrow('media link');
  });
});
