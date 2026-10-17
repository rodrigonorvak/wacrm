'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, Laptop, Loader2, Smartphone, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  EMAIL_TEMPLATES,
  buildTemplateBlocks,
  type EmailTemplate,
} from '@/lib/email-campaigns/templates';
import { renderEmailCampaign } from '@/lib/email-campaigns/render';
import type { EmailBlock } from '@/lib/email-campaigns/types';
import {
  DEFAULT_EMAIL_DESIGN,
  type EmailDesignSettings,
} from '@/lib/email-campaigns/types';
import { parseEmailCampaignContent } from '@/lib/email-campaigns/content';

type Tab = 'ready' | 'library' | 'previous';

interface PreviousCampaign {
  id: string;
  name: string;
  subject: string;
  updated_at: string;
}

interface PreviewItem {
  key: string;
  name: string;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  design?: EmailDesignSettings;
  href: string;
}

function EmailFrame({ item, mobile }: { item: PreviewItem; mobile?: boolean }) {
  const html = useMemo(
    () =>
      renderEmailCampaign(
        item.subject,
        item.preheader,
        item.blocks,
        undefined,
        item.design ?? DEFAULT_EMAIL_DESIGN
      ).html,
    [item]
  );
  return (
    <iframe
      title={item.name}
      srcDoc={html}
      sandbox=""
      className={cn(
        'h-full border-0 bg-white',
        mobile ? 'mx-auto w-[375px] max-w-full' : 'w-full'
      )}
    />
  );
}

export default function EmailTemplatesPage() {
  const t = useTranslations('EmailCampaigns');
  const locale = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('ready');
  const [previous, setPrevious] = useState<PreviousCampaign[] | null>(null);
  const [previousLoadError, setPreviousLoadError] = useState(false);
  const [previousReloadKey, setPreviousReloadKey] = useState(0);
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const [mobile, setMobile] = useState(false);
  const [previewingCampaignId, setPreviewingCampaignId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (tab !== 'previous' || previous) return;
    let cancelled = false;
    async function loadPreviousCampaigns() {
      setPreviousLoadError(false);
      try {
        const response = await fetch('/api/email/campaigns', {
          cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || t('loadFailed'));
        if (!Array.isArray(payload.campaigns)) {
          throw new Error(t('loadFailed'));
        }
        if (cancelled) return;
        setPrevious(
          payload.campaigns.filter(
            (campaign: { status: string }) => campaign.status === 'sent'
          )
        );
      } catch (error) {
        if (cancelled) return;
        setPreviousLoadError(true);
        toast.error(error instanceof Error ? error.message : t('loadFailed'));
      }
    }
    void loadPreviousCampaigns();
    return () => {
      cancelled = true;
    };
  }, [tab, previous, previousReloadKey, t]);

  function templateItem(template: EmailTemplate): PreviewItem {
    return {
      key: template.id,
      name: template.name,
      subject: template.subject,
      preheader: template.preheader,
      blocks: buildTemplateBlocks(template),
      design: DEFAULT_EMAIL_DESIGN,
      href: `/broadcasts/email/new?template=${template.id}`,
    };
  }

  async function openPreviousPreview(campaign: PreviousCampaign) {
    setPreviewingCampaignId(campaign.id);
    try {
      const response = await fetch(`/api/email/campaigns/${campaign.id}`, {
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t('loadFailed'));
      const parsed = parseEmailCampaignContent(payload.campaign.content_json);
      setPreview({
        key: campaign.id,
        name: campaign.name,
        subject: payload.campaign.subject ?? '',
        preheader: payload.campaign.preheader ?? '',
        blocks: parsed.blocks,
        design: parsed.design,
        href: `/broadcasts/email/new?from=${campaign.id}`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('loadFailed'));
    } finally {
      setPreviewingCampaignId(null);
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'ready', label: t('tabReady') },
    { id: 'library', label: t('tabLibrary') },
    { id: 'previous', label: t('tabPrevious') },
  ];
  // The library lists every template; "ready for you" is the curated subset.
  const visibleTemplates = EMAIL_TEMPLATES.filter(
    (template) => tab === 'library' || template.category === 'ready'
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <button
          type="button"
          onClick={() => router.push('/broadcasts/email')}
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          {t('backToCampaigns')}
        </button>
        <h1 className="text-foreground text-2xl font-bold">
          {t('templatesTitle')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('templatesDescription')}
        </p>
      </header>

      <div role="tablist" className="border-border flex gap-6 border-b">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              '-mb-px border-b-2 px-1 pb-2 text-sm font-medium',
              tab === item.id
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'previous' ? (
        previousLoadError ? (
          <div className="border-border bg-card rounded-xl border p-8 text-center">
            <p className="text-muted-foreground text-sm">{t('loadFailed')}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => setPreviousReloadKey((current) => current + 1)}
            >
              {t('retry')}
            </Button>
          </div>
        ) : previous === null ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="text-primary size-6 animate-spin" />
          </div>
        ) : previous.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {t('noPreviousCampaigns')}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {previous.map((campaign) => (
              <article
                key={campaign.id}
                className="border-border bg-card flex flex-col rounded-xl border p-4"
              >
                <h2 className="text-foreground truncate font-semibold">
                  {campaign.name}
                </h2>
                <p className="text-muted-foreground mt-1 truncate text-sm">
                  {campaign.subject || t('noSubject')}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {new Date(campaign.updated_at).toLocaleDateString(locale)}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void openPreviousPreview(campaign)}
                    disabled={previewingCampaignId === campaign.id}
                  >
                    {previewingCampaignId === campaign.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Eye />
                    )}
                    {t('previewAction')}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTemplates.map((template) => (
            <article
              key={template.id}
              className="border-border bg-card overflow-hidden rounded-xl border"
            >
              <div
                className="flex h-32 items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: template.accent }}
              >
                {template.name}
              </div>
              <div className="p-4">
                <p className="text-muted-foreground min-h-10 text-sm">
                  {template.description}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPreview(templateItem(template))}
                  >
                    <Eye />
                    {t('previewAction')}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
          className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4 backdrop-blur-sm sm:p-8"
        >
          <div className="bg-background mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl shadow-2xl">
            <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreview(null)}
              >
                <ArrowLeft />
                {t('backToTemplates')}
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant={mobile ? 'ghost' : 'secondary'}
                  aria-label={t('previewDesktop')}
                  onClick={() => setMobile(false)}
                >
                  <Laptop />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={mobile ? 'secondary' : 'ghost'}
                  aria-label={t('previewMobile')}
                  onClick={() => setMobile(true)}
                >
                  <Smartphone />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => router.push(preview.href)}>
                  {t('useTemplate')}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t('close')}
                  onClick={() => setPreview(null)}
                >
                  <X />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100">
              <EmailFrame item={preview} mobile={mobile} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
