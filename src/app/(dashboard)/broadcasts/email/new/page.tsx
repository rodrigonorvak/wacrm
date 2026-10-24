'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EmailCampaignEditor } from '@/components/email-campaigns/campaign-editor';

function NewCampaign() {
  const params = useSearchParams();
  return (
    <EmailCampaignEditor
      templateId={params.get('template') ?? undefined}
      cloneFromId={params.get('from') ?? undefined}
      savedTemplateId={params.get('model') ?? undefined}
    />
  );
}

export default function NewEmailCampaignPage() {
  return (
    <Suspense fallback={null}>
      <NewCampaign />
    </Suspense>
  );
}
