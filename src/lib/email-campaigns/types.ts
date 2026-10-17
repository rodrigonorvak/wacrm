export type EmailCampaignAudienceType =
  'all_contacts' | 'selected_contacts' | 'pipeline_stage';

export type EmailBlockType =
  'heading' | 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'footer';

export type EmailBlockAlignment = 'left' | 'center' | 'right';

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  text: string;
  url: string;
  alt: string;
  alignment: EmailBlockAlignment;
}

export interface EmailCampaignDraftInput {
  id?: string;
  senderConnectionId: string;
  name: string;
  subject: string;
  preheader: string;
  audienceType: EmailCampaignAudienceType;
  audienceContactIds: string[];
  audiencePipelineId: string | null;
  audienceStageId: string | null;
  content: EmailBlock[];
}

export interface EmailCampaignDraft extends EmailCampaignDraftInput {
  id: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'archived';
  senderName: string;
  senderEmail: string;
  updatedAt: string;
}
