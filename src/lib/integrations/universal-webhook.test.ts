import { describe, expect, it } from 'vitest';
import {
  flattenWebhookPayload,
  getUniversalWebhookEventId,
  readWebhookPath,
} from '@/lib/integrations/universal-webhook';

describe('universal webhook payload helpers', () => {
  it('reads nested and array paths', () => {
    const payload = {
      data: {
        buyer: { email: 'buyer@example.com' },
        items: [{ name: 'Ticket' }],
      },
    };
    expect(readWebhookPath(payload, 'data.buyer.email')).toBe(
      'buyer@example.com'
    );
    expect(readWebhookPath(payload, 'data.items[0].name')).toBe('Ticket');
  });

  it('flattens arbitrary payload paths with displayable values', () => {
    expect(
      flattenWebhookPayload({
        data: { buyer: { name: 'Joana' }, paid: true, amount: 30 },
      })
    ).toEqual([
      { path: 'data.buyer.name', value: 'Joana' },
      { path: 'data.paid', value: 'true' },
      { path: 'data.amount', value: '30' },
    ]);
  });

  it('prefers a notification id over a business event id', () => {
    expect(
      getUniversalWebhookEventId({
        id: 'notification',
        data: { event: { id: 'purchase' } },
      })
    ).toBe('notification');
  });
});
