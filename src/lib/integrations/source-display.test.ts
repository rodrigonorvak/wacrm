import { describe, expect, it } from 'vitest';
import { visibleLeadSource } from './source-display';

describe('visibleLeadSource', () => {
  it('hides organic origins without hiding other sources', () => {
    for (const value of ['Orgânico', ' ORGANICO ', 'organic', '', null, undefined]) {
      expect(visibleLeadSource(value)).toBeNull();
    }
    expect(visibleLeadSource('WhatsApp')).toBe('WhatsApp');
  });
});
