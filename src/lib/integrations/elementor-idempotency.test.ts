import { describe, expect, it } from 'vitest';

import { getElementorIdempotencyKey } from './elementor-idempotency';

describe('getElementorIdempotencyKey', () => {
  it('ignores the volatile Elementor Time field', () => {
    const first = getElementorIdempotencyKey({ name: 'Ana', phone: '5511999999999', Time: '10:30' });
    const retry = getElementorIdempotencyKey({ name: 'Ana', phone: '5511999999999', Time: '10:31' });
    expect(retry).toBe(first);
  });

  it('does not depend on object key order', () => {
    expect(getElementorIdempotencyKey({ name: 'Ana', phone: '123' })).toBe(
      getElementorIdempotencyKey({ phone: '123', name: 'Ana' }),
    );
  });

  it('keeps materially different submissions distinct', () => {
    expect(getElementorIdempotencyKey({ name: 'Ana', phone: '123' })).not.toBe(
      getElementorIdempotencyKey({ name: 'Bia', phone: '123' }),
    );
  });
});
