import {
  DEFAULT_EMAIL_DESIGN,
  type EmailBlock,
  type EmailDesignSettings,
  type ParsedEmailCampaignContent,
} from './types';

function isEmailBlockArray(value: unknown): value is EmailBlock[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.type === 'string' &&
        typeof item.text === 'string' &&
        typeof item.url === 'string' &&
        typeof item.alt === 'string' &&
        typeof item.alignment === 'string' &&
        (item.fontSize === undefined ||
          (typeof item.fontSize === 'number' &&
            Number.isInteger(item.fontSize) &&
            item.fontSize >= 10 &&
            item.fontSize <= 72))
    )
  );
}

function isEmailDesignSettings(value: unknown): value is EmailDesignSettings {
  if (!value || typeof value !== 'object') return false;
  const design = value as Partial<EmailDesignSettings>;
  return (
    (design.fontFamily === 'Arial' ||
      design.fontFamily === 'Georgia' ||
      design.fontFamily === 'Verdana') &&
    [
      design.emailBackground,
      design.sectionBackground,
      design.primaryText,
      design.secondaryText,
      design.buttonColor,
      design.accentColor,
    ].every(
      (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
    ) &&
    [design.sectionSpacing, design.cornerRadius, design.buttonRadius].every(
      (number) => typeof number === 'number' && Number.isFinite(number)
    )
  );
}

export function parseEmailCampaignContent(
  value: unknown
): ParsedEmailCampaignContent {
  if (isEmailBlockArray(value)) {
    return { blocks: value, design: DEFAULT_EMAIL_DESIGN };
  }
  if (
    value &&
    typeof value === 'object' &&
    'blocks' in value &&
    isEmailBlockArray((value as { blocks: unknown }).blocks)
  ) {
    const content = value as { blocks: EmailBlock[]; design?: unknown };
    return {
      blocks: content.blocks,
      design: isEmailDesignSettings(content.design)
        ? content.design
        : DEFAULT_EMAIL_DESIGN,
    };
  }
  return { blocks: [], design: DEFAULT_EMAIL_DESIGN };
}
