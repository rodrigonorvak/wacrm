import { describe, expect, it } from 'vitest';

import { buildMetaEventPayload } from './meta-events';

describe('Meta conversion event payloads', () => {
  const contact = {
    email: ' Lead@Example.com ',
    phone: '+55 (24) 99987-6543',
  };

  it('builds a website Lead event for Elementor', () => {
    const payload = buildMetaEventPayload(
      { source_type: 'elementor' },
      { dealId: 'deal-1', eventName: 'Lead' },
      contact,
      null,
      1_700_000_000,
    );

    expect(payload.action_source).toBe('website');
    expect(payload.event_name).toBe('Lead');
    expect(payload.event_time).toBe(1_700_000_000);
    expect(payload.user_data.em).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
    expect(payload.user_data.ph).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
  });

  it('includes lead_id and CRM metadata for Instant Forms', () => {
    const payload = buildMetaEventPayload(
      { source_type: 'meta_instant_form' },
      { dealId: 'deal-2', eventName: 'Purchase', value: 497, currency: 'BRL' },
      contact,
      '1234567890123456',
      1_700_000_001,
    );

    expect(payload.action_source).toBe('system_generated');
    expect(payload.user_data.lead_id).toBe('1234567890123456');
    expect(payload.custom_data).toEqual({
      lead_event_source: 'WACRM',
      event_source: 'crm',
      value: 497,
      currency: 'BRL',
    });
  });

  it('keeps Schedule as a stage event for both supported sources', () => {
    const elementorPayload = buildMetaEventPayload(
      { source_type: 'elementor' },
      { dealId: 'deal-3', eventName: 'Schedule' },
      contact,
      null,
      1_700_000_002,
    );
    const instantFormPayload = buildMetaEventPayload(
      { source_type: 'meta_instant_form' },
      { dealId: 'deal-3', eventName: 'Schedule' },
      contact,
      '1234567890123456',
      1_700_000_002,
    );

    expect(elementorPayload.event_name).toBe('Schedule');
    expect(elementorPayload.action_source).toBe('website');
    expect(instantFormPayload.event_name).toBe('Schedule');
    expect(instantFormPayload.action_source).toBe('system_generated');
    expect(instantFormPayload.user_data.lead_id).toBe('1234567890123456');
  });

  it('builds a website Purchase event with value and currency', () => {
    const payload = buildMetaEventPayload(
      { source_type: 'elementor' },
      { dealId: 'deal-4', eventName: 'Purchase', value: 1250, currency: 'BRL' },
      contact,
      null,
      1_700_000_003,
    );

    expect(payload.event_name).toBe('Purchase');
    expect(payload.custom_data).toEqual({ value: 1250, currency: 'BRL' });
  });
});
