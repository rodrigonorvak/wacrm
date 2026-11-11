import { describe, expect, it } from 'vitest';
import {
  appendEmailOpenTrackingPixel,
  createEmailOpenTrackingPixel,
} from './open-tracking';

const DELIVERY_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('email open tracking', () => {
  it('creates a hidden pixel using the configured public origin', () => {
    expect(
      createEmailOpenTrackingPixel(
        'https://crm.example.com/subpath',
        DELIVERY_ID
      )
    ).toContain(`src="https://crm.example.com/api/email/open/${DELIVERY_ID}"`);
  });

  it('inserts the pixel before the closing body tag', () => {
    const tracked = appendEmailOpenTrackingPixel(
      '<html><body>Hi</body></html>',
      'https://crm.example.com',
      DELIVERY_ID
    );

    expect(tracked).toContain(
      `Hi<img src="https://crm.example.com/api/email/open/${DELIVERY_ID}"`
    );
    expect(tracked).toMatch(/<\/body><\/html>$/);
  });

  it('appends the pixel when the HTML has no body tag', () => {
    expect(
      appendEmailOpenTrackingPixel(
        '<p>Hi</p>',
        'https://crm.example.com',
        DELIVERY_ID
      )
    ).toMatch(/<\/p><img src="https:\/\/crm\.example\.com\/api\/email\/open\//);
  });

  it('rejects invalid delivery IDs and non-HTTP URLs', () => {
    expect(() =>
      createEmailOpenTrackingPixel('https://crm.example.com', 'invalid')
    ).toThrow('A valid delivery ID is required');
    expect(() =>
      createEmailOpenTrackingPixel('javascript:alert(1)', DELIVERY_ID)
    ).toThrow();
  });
});
