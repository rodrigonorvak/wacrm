'use client';

import { Suspense, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { THEMES } from '@/lib/themes';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { MetaIntegrations } from '@/components/settings/meta-integrations';
import { IntegrationsOverview } from '@/components/settings/integrations-overview';
import { TemplateManager } from '@/components/settings/template-manager';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import {
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';

// `useSearchParams` opts this page out of static prerendering unless it
// sits under a Suspense boundary. Without one, the production build hits
// the "missing Suspense with CSR bailout" error and the whole page bails
// to client-side rendering — shipping a settings screen whose rail never
// wires up its click handlers. You land on the section the URL carried
// (the account-menu Settings link points at `?tab=whatsapp`) and can't
// navigate away. Mirror the login/signup split: a thin wrapper supplies
// the boundary; the inner component reads the query string.
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency } = useAuth();
  const { theme } = useTheme();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const section = resolveSection(searchParams.get('tab'));
  const integration = searchParams.get('integration');

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    params.delete('integration');
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  const openMetaIntegration = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'integrations');
    params.set('integration', 'meta');
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: THEMES.find((item) => item.id === theme)?.name ?? theme,
      deals: defaultCurrency,
    }),
    [theme, defaultCurrency],
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    profile: <ProfileForm />,
    security: <SecurityPanel />,
    appearance: <AppearancePanel />,
    whatsapp: <WhatsAppConfig />,
    integrations: integration === 'meta' ? (
      <MetaIntegrations onBack={() => go('integrations')} />
    ) : (
      <IntegrationsOverview onOpenMeta={openMetaIntegration} />
    ),
    templates: <TemplateManager />,
    'quick-replies': <QuickRepliesManager />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    api: <ApiKeysSettings />,
  };

  return (
    <div className="-m-4 min-h-full bg-muted/50 sm:-m-6">
      <div className="grid min-h-full lg:grid-cols-[216px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-background lg:border-r lg:border-b-0">
          <div className="flex h-12 items-center border-b border-border px-5">
            <span className="text-xs font-semibold uppercase text-foreground">
              {t('pageTitle')}
            </span>
          </div>
          <div className="p-3">
            <SettingsRail active={section} onSelect={go} hints={hints} />
          </div>
        </aside>

        <div className="min-w-0 bg-background px-4 py-5 sm:px-6 sm:py-6">
          {section === 'overview' && (
            <div className="mb-6 border-b border-border pb-4">
              <h1 className="text-lg font-semibold text-foreground">
                {t('pageTitle')}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('pageDesc')}</p>
            </div>
          )}
          {panel[section]}
        </div>
      </div>
    </div>
  );
}
