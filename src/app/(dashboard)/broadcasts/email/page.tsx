'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  FileText,
  Loader2,
  Mail,
  Plus,
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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
          <Button
            type="button"
            onClick={() => router.push('/broadcasts/email/new')}
          >
            <Plus />
            {t('newCampaign')}
          </Button>
        </div>
      </header>

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
            onClick={() => router.push('/broadcasts/email/new')}
          >
            <Plus />
            {t('newCampaign')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
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
                    <span>{campaign.sender?.name ?? t('senderMissing')}</span>
                    <span>{audienceLabel(campaign)}</span>
                    <span>
                      {t('updatedAt', {
                        date: new Date(campaign.updated_at).toLocaleDateString(
                          locale
                        ),
                      })}
                    </span>
                    {campaign.scheduled_at && (
                      <span>
                        {t('scheduledAt', {
                          date: new Date(campaign.scheduled_at).toLocaleString(
                            locale
                          ),
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
  );
}
