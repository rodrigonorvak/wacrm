import { describe, expect, it } from 'vitest';
import { formatMessageDeliveryError } from './message-delivery-error';

describe('formatMessageDeliveryError', () => {
  it('combines Meta delivery details without duplicating repeated messages', () => {
    expect(
      formatMessageDeliveryError([
        {
          code: 131026,
          title: 'Message undeliverable',
          message: 'Message undeliverable',
          error_data: { details: 'The recipient is unavailable.' },
        },
      ]),
    ).toBe(
      'Message undeliverable — The recipient is unavailable. — code 131026',
    );
  });

  it('returns null when the webhook has no usable error details', () => {
    expect(formatMessageDeliveryError()).toBeNull();
    expect(formatMessageDeliveryError([{}])).toBeNull();
    expect(formatMessageDeliveryError([null])).toBeNull();
  });
});
