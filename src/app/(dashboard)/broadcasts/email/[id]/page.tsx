'use client';

import { useParams } from 'next/navigation';
import { EmailCampaignEditor } from '@/components/email-campaigns/campaign-editor';

export default function EditEmailCampaignPage() {
  const params = useParams<{ id: string }>();
  return <EmailCampaignEditor campaignId={params.id} />;
}
