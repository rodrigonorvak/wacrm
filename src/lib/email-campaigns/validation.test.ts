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

  it('accepts the versioned content document and validates design settings', () => {
    const result = validateEmailCampaignDraft({
      ...validDraft,
      content: {
        version: 1,
        blocks: [{ ...validDraft.content[0], type: 'hero' }],
        design: {
          fontFamily: 'Georgia',
          emailBackground: '#f2f4f7',
          sectionBackground: '#ffffff',
          primaryText: '#172033',
          secondaryText: '#344054',
          buttonColor: '#c026d3',
          accentColor: '#e10c8c',
          sectionSpacing: 40,
          cornerRadius: 12,
          buttonRadius: 8,
        },
      },
    });
    expect('input' in result && result.input.content[0].type).toBe('hero');
    expect('input' in result && result.input.design?.fontFamily).toBe(
      'Georgia'
    );
  });

  it('rejects unsafe colors and out-of-range design settings', () => {
    const unsafeColor = validateEmailCampaignDraft({
      ...validDraft,
      design: {
        fontFamily: 'Arial',
        emailBackground: 'url(javascript:alert(1))',
        sectionBackground: '#ffffff',
        primaryText: '#172033',
        secondaryText: '#344054',
        buttonColor: '#c026d3',
        accentColor: '#e10c8c',
        sectionSpacing: 32,
        cornerRadius: 8,
        buttonRadius: 6,
      },
    });
    const invalidSpacing = validateEmailCampaignDraft({
      ...validDraft,
      design: {
        fontFamily: 'Arial',
        emailBackground: '#f2f4f7',
        sectionBackground: '#ffffff',
        primaryText: '#172033',
        secondaryText: '#344054',
        buttonColor: '#c026d3',
        accentColor: '#e10c8c',
        sectionSpacing: 1000,
        cornerRadius: 8,
        buttonRadius: 6,
      },
    });
    expect('error' in unsafeColor).toBe(true);
    expect('error' in invalidSpacing).toBe(true);
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
