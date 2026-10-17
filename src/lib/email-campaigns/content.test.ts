import { describe, expect, it } from 'vitest';
import { parseEmailCampaignContent } from './content';
import { DEFAULT_EMAIL_DESIGN } from './types';

const block = {
  id: 'block-1',
  type: 'text',
  text: 'Legacy content',
  url: '',
  alt: '',
  alignment: 'left',
} as const;

describe('email campaign content parsing', () => {
  it('keeps existing block-array campaigns and supplies default design', () => {
    expect(parseEmailCampaignContent([block])).toEqual({
      blocks: [block],
      design: DEFAULT_EMAIL_DESIGN,
    });
  });

  it('loads versioned campaign content and its design', () => {
    const design = {
      ...DEFAULT_EMAIL_DESIGN,
      fontFamily: 'Georgia' as const,
    };
    expect(
      parseEmailCampaignContent({ version: 1, blocks: [block], design })
    ).toEqual({ blocks: [block], design });
  });
});
