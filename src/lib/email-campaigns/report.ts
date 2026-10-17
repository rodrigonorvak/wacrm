export const EMAIL_CAMPAIGN_DELIVERY_STATUSES = [
  'queued',
  'sending',
  'sent',
  'failed',
  'skipped',
] as const;

export type EmailCampaignDeliveryStatus =
  (typeof EMAIL_CAMPAIGN_DELIVERY_STATUSES)[number];

export type EmailCampaignReportFilter = 'all' | EmailCampaignDeliveryStatus;

export const EMAIL_CAMPAIGN_REPORT_PAGE_SIZE = 50;

const MAX_REPORT_PAGE = 100_000;

export function parseEmailCampaignReportQuery(
  searchParams: URLSearchParams
): { page: number; status: EmailCampaignReportFilter } | null {
  const pageValue = searchParams.get('page') ?? '1';
  if (!/^[1-9]\d*$/.test(pageValue)) return null;

  const page = Number(pageValue);
  if (!Number.isSafeInteger(page) || page > MAX_REPORT_PAGE) return null;

  const statusValue = searchParams.get('status') ?? 'all';
  const matchedStatus = EMAIL_CAMPAIGN_DELIVERY_STATUSES.find(
    (status) => status === statusValue
  );
  if (statusValue !== 'all' && !matchedStatus) return null;

  return {
    page,
    status: matchedStatus ?? 'all',
  };
}
