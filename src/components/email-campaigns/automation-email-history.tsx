'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface AutomationEmail {
  id: string;
  automation_name: string | null;
  recipient: string;
  subject: string | null;
  date: string;
  date_is_run_start: boolean;
}

export function AutomationEmailHistory() {
  const t = useTranslations('EmailCampaigns');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [emails, setEmails] = useState<AutomationEmail[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/email/automation-history?page=${page}`, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Automation history request failed: ${response.status}`);
      const payload = await response.json() as { emails: AutomationEmail[]; hasMore: boolean };
      if (signal.aborted) return;
      setEmails(payload.emails);
      setHasMore(payload.hasMore);
    } catch (err) {
      if (signal.aborted) return;
      console.error('[automation-email-history] load failed:', err);
      setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  return (
    <section className="border-border bg-card space-y-3 rounded-xl border p-4">
      <div>
        <h2 className="text-foreground font-semibold">{t('automationHistoryTitle')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('automationHistoryDescription')}</p>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">{t('automationHistoryLoading')}</p>
      ) : error ? (
        <div>
          <p className="text-muted-foreground text-sm">{t('automationHistoryError')}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setRetry((value) => value + 1)}>{t('retry')}</Button>
        </div>
      ) : emails.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('automationHistoryEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {emails.map((email) => (
            <li key={email.id} className="border-border rounded-lg border p-3 text-sm">
              <p className="text-foreground font-medium">{email.subject ?? t('automationSubjectUnavailable')}</p>
              <p className="text-muted-foreground mt-1 break-all">{email.recipient}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {email.automation_name ?? t('automationNameUnavailable')}
                {' · '}
                {email.date_is_run_start ? t('automationRunStarted') : t('automationSentAt')}
                {' '}
                <time dateTime={email.date}>{new Date(email.date).toLocaleString(locale)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && (page > 1 || hasMore) && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>{t('automationPrevious')}</Button>
          <span className="text-muted-foreground text-xs">{t('automationPage', { page })}</span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>{t('automationNext')}</Button>
        </div>
      )}
    </section>
  );
}
