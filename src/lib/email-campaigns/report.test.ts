import { describe, expect, it } from 'vitest';
import { parseEmailCampaignReportQuery } from './report';

describe('parseEmailCampaignReportQuery', () => {
  it('uses the first page and all statuses by default', () => {
    expect(parseEmailCampaignReportQuery(new URLSearchParams())).toEqual({
      page: 1,
      status: 'all',
    });
  });

  it('accepts a supported status and positive page number', () => {
    expect(
      parseEmailCampaignReportQuery(new URLSearchParams('page=3&status=failed'))
    ).toEqual({ page: 3, status: 'failed' });
  });

  it.each(['page=0', 'page=-1', 'page=1.5', 'page=100001', 'status=delivered'])(
    'rejects invalid query parameters: %s',
    (query) => {
      expect(
        parseEmailCampaignReportQuery(new URLSearchParams(query))
      ).toBeNull();
    }
  );
});
