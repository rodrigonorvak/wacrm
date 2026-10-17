import { describe, expect, it } from 'vitest';
import {
  validateEmailCampaignDraft,
  validateEmailCampaignReadyToSend,
} from './validation';

const senderId = '00000000-0000-4000-8000-000000000010';
const blockId = '00000000-0000-4000-8000-000000000001';
const contactId = '00000000-0000-4000-8000-000000000020';

const validDraft = {
  senderConnectionId: senderId,
  name: 'Campanha de matrícula',
  subject: 'Inscrições abertas',
  preheader: 'Conheça os cursos',
  audienceType: 'all_contacts',
  audienceContactIds: [],
  audiencePipelineId: null,
  audienceStageId: null,
  content: [
    {
      id: blockId,
      type: 'heading',
      text: 'Olá!',
      url: '',
      alt: '',
      alignment: 'center',
    },
  ],
};

describe('email campaign draft validation', () => {
  it('accepts a valid all-contacts draft', () => {
    const result = validateEmailCampaignDraft(validDraft);
    expect('input' in result).toBe(true);
  });

  it('rejects script URLs in content blocks', () => {
    const result = validateEmailCampaignDraft({
      ...validDraft,
      content: [
        {
          ...validDraft.content[0],
          type: 'button',
          url: 'javascript:alert(1)',
        },
      ],
    });
    expect('error' in result).toBe(true);
  });

  it('rejects line breaks in the subject', () => {
    const result = validateEmailCampaignDraft({
      ...validDraft,
      subject: 'Assunto\nBcc: fraud@example.com',
    });
    expect('error' in result).toBe(true);
  });

  it('requires at least one selected contact for a manual audience', () => {
    const result = validateEmailCampaignDraft({
      ...validDraft,
      audienceType: 'selected_contacts',
    });
    expect('error' in result).toBe(true);
  });

  it('accepts a manually selected contact and clears unrelated audience fields', () => {
    const result = validateEmailCampaignDraft({
      ...validDraft,
      audienceType: 'selected_contacts',
      audienceContactIds: [contactId],
      audiencePipelineId: 'ignored',
      audienceStageId: 'ignored',
    });
    expect('input' in result && result.input.audienceContactIds).toEqual([
      contactId,
    ]);
    expect('input' in result && result.input.audiencePipelineId).toBeNull();
  });

  it('requires a subject and visible content before campaign delivery', () => {
    const result = validateEmailCampaignDraft(validDraft);
    expect('input' in result).toBe(true);
    if (!('input' in result)) return;
    expect(validateEmailCampaignReadyToSend(result.input)).toBeNull();
    expect(
      validateEmailCampaignReadyToSend({
        ...result.input,
        subject: '',
      })
    ).toContain('assunto');
    expect(
      validateEmailCampaignReadyToSend({
        ...result.input,
        content: [],
      })
    ).toContain('conteúdo');
  });
});
