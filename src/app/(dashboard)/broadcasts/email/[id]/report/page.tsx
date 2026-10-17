'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  EMAIL_CAMPAIGN_DELIVERY_STATUSES,
  EMAIL_CAMPAIGN_REPORT_PAGE_SIZE,
  type EmailCampaignDeliveryStatus,
  type EmailCampaignReportFilter,
} from '@/lib/email-campaigns/report';

interface CampaignReport {
  campaign: {
    id: string;
    name: string;
    subject: string;
    status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'archived';
    scheduled_at: string | null;
  };
  counts: Record<EmailCampaignDeliveryStatus, number>;
  deliveries: Array<{
    id: string;
    email_address: string;
    status: EmailCampaignDeliveryStatus;
    attempt_count: number;
    sent_at: string | null;
    last_error: string | null;
    created_at: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export default function EmailCampaignReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('EmailCampaigns');
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [status, setStatus] = useState<EmailCampaignReportFilter>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const search = new URLSearchParams({
        page: String(page),
        status,
      });
      const response = await fetch(
        `/api/email/campaigns/${params.id}/report?${search.toString()}`,
        { cache: 'no-store' }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t('reportLoadFailed'));
      setReport(payload);
      const pageCount = Math.max(
        1,
        Math.ceil(payload.total / payload.pageSize)
      );
      if (page > pageCount) setPage(pageCount);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, params.id, status, t]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale) : t('notAvailable');

  const statusLabel = (value: EmailCampaignDeliveryStatus) => {
    const labels: Record<EmailCampaignDeliveryStatus, string> = {
      queued: t('deliveryQueued'),
      sending: t('deliverySending'),
      sent: t('deliverySent'),
      failed: t('deliveryFailed'),
      skipped: t('deliverySkipped'),
    };
    return labels[value];
  };

  const totalRecipients = report
    ? EMAIL_CAMPAIGN_DELIVERY_STATUSES.reduce(
        (total, deliveryStatus) => total + report.counts[deliveryStatus],
        0
      )
    : 0;
  const totalPages = report
    ? Math.max(1, Math.ceil(report.total / EMAIL_CAMPAIGN_REPORT_PAGE_SIZE))
    : 1;
  const inProgressCount = report
    ? report.counts.queued + report.counts.sending
    : 0;

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-3">
        <Button
          type="button"
          variant="ghost"
          className="-ml-3"
          onClick={() => router.push('/broadcasts/email')}
        >
          <ArrowLeft />
          {t('backToCampaigns')}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-primary text-sm font-medium">
              {t('reportTitle')}
            </p>
            <h1 className="text-foreground mt-1 truncate text-2xl font-bold">
              {report?.campaign.name ?? t('reportLoading')}
            </h1>
            {report && (
              <p className="text-muted-foreground mt-1 truncate text-sm">
                {report.campaign.subject || t('noSubject')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium">
                {t(report.campaign.status)}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadReport()}
              disabled={loading}
              aria-label={t('refreshReport')}
            >
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t('refreshReport')}
            </Button>
          </div>
        </div>
      </header>

      {loadError ? (
        <section className="border-border bg-card rounded-xl border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {t('reportLoadFailed')}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void loadReport()}
          >
            {t('retry')}
          </Button>
        </section>
      ) : !report ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : (
        <>
          <section aria-label={t('reportMetrics')} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label={t('totalRecipients')}
                value={totalRecipients}
              />
              <MetricCard
                label={t('deliverySent')}
                value={report.counts.sent}
              />
              <MetricCard
                label={t('deliveryFailed')}
                value={report.counts.failed}
              />
              <MetricCard
                label={t('deliverySkipped')}
                value={report.counts.skipped}
              />
              <MetricCard
                label={t('deliveryInProgress')}
                value={inProgressCount}
                detail={t('deliveryProgressDetail', {
                  queued: report.counts.queued,
                  sending: report.counts.sending,
                })}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {t('reportMetricDisclaimer')}
            </p>
            {report.campaign.scheduled_at && (
              <p className="text-muted-foreground text-xs">
                {t('scheduledAt', {
                  date: formatDate(report.campaign.scheduled_at),
                })}
              </p>
            )}
          </section>

          <section className="border-border bg-card overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div>
                <h2 className="text-foreground font-semibold">
                  {t('recipientHistory')}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('reportPageCount', {
                    count: report.total,
                    page,
                    pages: totalPages,
                  })}
                </p>
              </div>
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <span>{t('filterByStatus')}</span>
                <select
                  className="border-border bg-background text-foreground rounded-md border px-3 py-2"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as EmailCampaignReportFilter);
                    setPage(1);
                  }}
                >
                  <option value="all">{t('allStatuses')}</option>
                  {EMAIL_CAMPAIGN_DELIVERY_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {statusLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <div className="flex h-36 items-center justify-center">
                <Loader2 className="text-primary size-6 animate-spin" />
              </div>
            ) : report.deliveries.length === 0 ? (
              <p className="text-muted-foreground p-8 text-center text-sm">
                {t('noReportDeliveries')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">
                        {t('reportEmail')}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t('reportStatus')}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t('reportAttempts')}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t('reportResult')}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t('reportDate')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {report.deliveries.map((delivery) => (
                      <tr key={delivery.id}>
                        <td className="text-foreground max-w-xs truncate px-4 py-3">
                          {delivery.email_address}
                        </td>
                        <td className="px-4 py-3">
                          {statusLabel(delivery.status)}
                        </td>
                        <td className="text-muted-foreground px-4 py-3">
                          {delivery.attempt_count}
                        </td>
                        <td className="text-muted-foreground max-w-sm px-4 py-3">
                          {delivery.last_error || t('noDeliveryError')}
                        </td>
                        <td className="text-muted-foreground px-4 py-3">
                          {formatDate(delivery.sent_at ?? delivery.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="flex items-center justify-between gap-3 border-t p-4">
              <p className="text-muted-foreground text-sm">
                {t('reportPageCount', {
                  count: report.total,
                  page,
                  pages: totalPages,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={loading || page <= 1}
                  aria-label={t('previous')}
                >
                  <ChevronLeft />
                  {t('previous')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={loading || page >= totalPages}
                  aria-label={t('next')}
                >
                  {t('next')}
                  <ChevronRight />
                </Button>
              </div>
            </footer>
          </section>
        </>
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <article className="border-border bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-foreground mt-2 text-2xl font-semibold">
        {value.toLocaleString()}
      </p>
      {detail && <p className="text-muted-foreground mt-1 text-xs">{detail}</p>}
    </article>
  );
}
