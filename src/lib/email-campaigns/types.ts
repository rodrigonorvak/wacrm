export type EmailCampaignAudienceType =
  'all_contacts' | 'selected_contacts' | 'pipeline_stage';

export type EmailBlockType =
  | 'hero'
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'footer';

export type EmailBlockAlignment = 'left' | 'center' | 'right';

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  text: string;
  url: string;
  alt: string;
  alignment: EmailBlockAlignment;
}

export interface EmailDesignSettings {
  fontFamily: 'Arial' | 'Georgia' | 'Verdana';
  emailBackground: string;
  sectionBackground: string;
  primaryText: string;
  secondaryText: string;
  buttonColor: string;
  accentColor: string;
  sectionSpacing: number;
  cornerRadius: number;
  buttonRadius: number;
}

export const DEFAULT_EMAIL_DESIGN: EmailDesignSettings = {
  fontFamily: 'Arial',
  emailBackground: '#f2f4f7',
  sectionBackground: '#ffffff',
  primaryText: '#172033',
  secondaryText: '#344054',
  buttonColor: '#c026d3',
  accentColor: '#e10c8c',
  sectionSpacing: 32,
  cornerRadius: 8,
  buttonRadius: 6,
};

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
  design?: EmailDesignSettings;
}

export interface ParsedEmailCampaignContent {
  blocks: EmailBlock[];
  design: EmailDesignSettings;
}

export interface EmailCampaignDraft extends EmailCampaignDraftInput {
  id: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'archived';
  senderName: string;
  senderEmail: string;
  updatedAt: string;
}
