'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  FileText,
  FilePlus,
  LayoutTemplate,
  Loader2,
  Mail,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  audience_type: 'all_contacts' | 'selected_contacts' | 'pipeline_stage';
  audience_contact_ids: string[];
  audience_member_count: number;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'archived';
  scheduled_at: string | null;
  sent_count: number;
  updated_at: string;
  sender: { id: string; name: string; from_email: string } | null;
}

export default function EmailCampaignsPage() {
  const t = useTranslations('EmailCampaigns');
  const locale = useLocale();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [metrics, setMetrics] = useState({
    sent: 0,
    failed: 0,
    unsubscribed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    CampaignRow['status'] | 'all'
  >('all');

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/email/campaigns', {
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t('loadFailed'));
      setCampaigns(payload.campaigns ?? []);
      setMetrics(payload.metrics ?? { sent: 0, failed: 0, unsubscribed: 0 });
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  async function deleteDraft(campaign: CampaignRow) {
    if (!window.confirm(t('deleteConfirm', { name: campaign.name }))) return;
    setDeletingId(campaign.id);
    try {
      const response = await fetch(`/api/email/campaigns/${campaign.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t('deleteFailed'));
      setCampaigns((current) =>
        current.filter((item) => item.id !== campaign.id)
      );
      toast.success(t('deleted'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }

  async function cancelSchedule(campaign: CampaignRow) {
    if (!window.confirm(t('cancelScheduleConfirm', { name: campaign.name }))) {
      return;
    }
    setCancellingId(campaign.id);
    try {
      const response = await fetch(
        `/api/email/campaigns/${campaign.id}/cancel`,
        { method: 'POST' }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || t('cancelScheduleFailed'));
      }
      await loadCampaigns();
      toast.success(t('scheduleCancelled'));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('cancelScheduleFailed')
      );
    } finally {
      setCancellingId(null);
    }
  }

  function audienceLabel(campaign: CampaignRow): string {
    if (campaign.audience_type === 'all_contacts') return t('allContacts');
    if (campaign.audience_type === 'pipeline_stage')
      return t('pipelineAudienceCount', {
        count: campaign.audience_member_count,
      });
    return t('selectedContactsCount', {
      count: campaign.audience_member_count,
    });
  }

  const stats = [
    { key: 'statCampaigns', value: campaigns.length },
    { key: 'statSent', value: metrics.sent },
    { key: 'statFailed', value: metrics.failed },
    { key: 'statUnsubscribed', value: metrics.unsubscribed },
  ];
  const statusFilters: Array<CampaignRow['status'] | 'all'> = [
    'all',
    'draft',
    'scheduled',
    'sending',
    'sent',
    'failed',
    'archived',
  ];
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase(locale);
  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesStatus =
      statusFilter === 'all' || campaign.status === statusFilter;
    const searchableText = [
      campaign.name,
      campaign.subject,
      campaign.sender?.name ?? '',
      campaign.sender?.from_email ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase(locale);
    return (
      matchesStatus &&
      (!normalizedSearch || searchableText.includes(normalizedSearch))
    );
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-sm font-medium">{t('section')}</p>
          <h1 className="text-foreground mt-1 text-2xl font-bold">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/broadcasts/email/senders')}
          >
            <Settings2 />
            {t('senders')}
          </Button>
          <Button type="button" onClick={() => setChoosing(true)}>
            <Plus />
            {t('newCampaign')}
          </Button>
        </div>
      </header>

      {!loading && !loadError && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.key}
              className="border-border bg-card rounded-xl border p-4"
            >
              <p className="text-muted-foreground text-xs font-medium">
                {t(stat.key)}
              </p>
              <p className="text-foreground mt-1 text-2xl font-bold">
                {stat.value.toLocaleString(locale)}
              </p>
            </div>
          ))}
        </div>
      )}

      {choosing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('newCampaign')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="bg-background w-full max-w-lg rounded-xl p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-foreground text-lg font-semibold">
                {t('chooseStartTitle')}
              </h2>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t('close')}
                onClick={() => setChoosing(false)}
              >
                <X />
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => router.push('/broadcasts/email/templates')}
                className="border-border hover:border-primary rounded-xl border p-4 text-left transition-colors"
              >
                <LayoutTemplate className="text-primary size-6" />
                <span className="text-foreground mt-2 block font-semibold">
                  {t('startFromTemplate')}
                </span>
                <span className="text-muted-foreground mt-1 block text-sm">
                  {t('startFromTemplateDescription')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => router.push('/broadcasts/email/new')}
                className="border-border hover:border-primary rounded-xl border p-4 text-left transition-colors"
              >
                <FilePlus className="text-primary size-6" />
                <span className="text-foreground mt-2 block font-semibold">
                  {t('startFromScratch')}
                </span>
                <span className="text-muted-foreground mt-1 block text-sm">
                  {t('startFromScratchDescription')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : loadError ? (
        <div className="border-border bg-card rounded-xl border p-8 text-center">
          <p className="text-muted-foreground text-sm">{t('loadFailed')}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void loadCampaigns()}
          >
            {t('retry')}
          </Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center rounded-xl border border-dashed py-14 text-center">
          <Mail className="text-muted-foreground size-10" />
          <h2 className="text-foreground mt-3 font-semibold">
            {t('emptyTitle')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-lg text-sm">
            {t('emptyDescription')}
          </p>
          <Button
            type="button"
            className="mt-5"
            onClick={() => setChoosing(true)}
          >
            <Plus />
            {t('newCampaign')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border-border bg-card space-y-3 rounded-xl border p-3">
            <label className="border-border bg-background text-muted-foreground flex h-10 items-center gap-2 rounded-lg border px-3">
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('searchCampaigns')}
                aria-label={t('searchCampaigns')}
                className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label={t('filterByStatus')}
            >
              {statusFilters.map((status) => {
                const count =
                  status === 'all'
                    ? campaigns.length
                    : campaigns.filter((campaign) => campaign.status === status)
                        .length;
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={statusFilter === status}
                    onClick={() => setStatusFilter(status)}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      statusFilter === status
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {status === 'all' ? t('filterAll') : t(status)}
                    <span className="opacity-75">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredCampaigns.length === 0 ? (
            <div className="border-border bg-card rounded-xl border p-8 text-center">
              <p className="text-muted-foreground text-sm">
                {t('noCampaignMatches')}
              </p>
              <Button
                type="button"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
              >
                {t('clearFilters')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCampaigns.map((campaign) => {
                const content = (
                  <>
                    <span className="min-w-0">
                      <span className="text-foreground block truncate font-semibold">
                        {campaign.name}
                      </span>
                      <span className="text-muted-foreground mt-1 block truncate text-sm">
                        {campaign.subject || t('noSubject')}
                      </span>
                      <span className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span>
                          {campaign.sender?.name ?? t('senderMissing')}
                        </span>
                        <span>{audienceLabel(campaign)}</span>
                        <span>
                          {t('updatedAt', {
                            date: new Date(
                              campaign.updated_at
                            ).toLocaleDateString(locale),
                          })}
                        </span>
                        {campaign.scheduled_at && (
                          <span>
                            {t('scheduledAt', {
                              date: new Date(
                                campaign.scheduled_at
                              ).toLocaleString(locale),
                            })}
                          </span>
                        )}
                        {campaign.sent_count > 0 && (
                          <span>
                            {t('sentCount', { count: campaign.sent_count })}
                          </span>
                        )}
                      </span>
                    </span>
                  </>
                );

                return (
                  <article
                    key={campaign.id}
                    className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
                  >
                    {campaign.status === 'draft' ? (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/broadcasts/email/${campaign.id}`)
                        }
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <FileText className="text-primary mt-0.5 size-5 shrink-0" />
                        {content}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/broadcasts/email/${campaign.id}/report`)
                        }
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <BarChart3 className="text-primary mt-0.5 size-5 shrink-0" />
                        {content}
                      </button>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium">
                        {t(campaign.status)}
                      </span>
                      {campaign.status === 'scheduled' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={t('cancelSchedule')}
                          onClick={() => void cancelSchedule(campaign)}
                          disabled={cancellingId === campaign.id}
                        >
                          {cancellingId === campaign.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <X />
                          )}
                        </Button>
                      )}
                      {campaign.status === 'draft' && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          aria-label={t('delete')}
                          onClick={() => void deleteDraft(campaign)}
                          disabled={deletingId === campaign.id}
                        >
                          {deletingId === campaign.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
