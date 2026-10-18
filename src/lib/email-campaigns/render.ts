import {
  DEFAULT_EMAIL_DESIGN,
  defaultEmailBlockFontSize,
  type EmailBlock,
  type EmailDesignSettings,
} from './types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderText(value: string): string {
  return escapeHtml(value).replace(/\r\n?|\n/g, '<br />');
}

function safeUrl(value: string, allowMailto: boolean): string | null {
  try {
    const url = new URL(value);
    const allowed =
      url.protocol === 'https:' ||
      url.protocol === 'http:' ||
      (allowMailto && url.protocol === 'mailto:');
    return allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getSafeEmailLinkUrl(value: string): string | null {
  return safeUrl(value, true);
}

function isAllowedUrl(value: string, allowMailto: boolean): boolean {
  return safeUrl(value, allowMailto) !== null;
}

function renderRichText(value: string): string {
  const pattern = /\[((?:\\\]|[^\]\r\n])+)\]\(([^)\s]+)\)/g;
  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    const url = getSafeEmailLinkUrl(match[2]);
    if (!url) continue;
    result += renderText(value.slice(cursor, match.index));
    result += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${renderText(
      match[1].replace(/\\\]/g, ']')
    )}</a>`;
    cursor = pattern.lastIndex;
  }

  return result + renderText(value.slice(cursor));
}

function renderPlainText(value: string): string {
  const pattern = /\[((?:\\\]|[^\]\r\n])+)\]\(([^)\s]+)\)/g;
  return value.replace(pattern, (match, rawLabel: string, rawUrl: string) => {
    const url = getSafeEmailLinkUrl(rawUrl);
    return url ? `${rawLabel.replace(/\\\]/g, ']')} (${url})` : match;
  });
}

function renderBlock(block: EmailBlock, design: EmailDesignSettings): string {
  const alignment = `text-align:${block.alignment};`;
  const text = renderText(block.text);
  const richText = renderRichText(block.text);
  const font = design.fontFamily;
  const requestedFontSize = block.fontSize;
  const fontSize =
    typeof requestedFontSize === 'number' &&
    Number.isInteger(requestedFontSize) &&
    requestedFontSize >= 10 &&
    requestedFontSize <= 72
      ? requestedFontSize
      : defaultEmailBlockFontSize(block.type);

  switch (block.type) {
    case 'hero':
      return `<div style="margin:0 0 20px;padding:40px 24px;border-radius:${design.cornerRadius}px;background:${design.accentColor};color:#ffffff;font-family:${font},sans-serif;font-size:${fontSize}px;font-weight:bold;line-height:1.2;${alignment}">${richText}</div>`;
    case 'heading':
      return `<h1 style="margin:0 0 20px;color:${design.primaryText};font-family:${font},sans-serif;font-size:${fontSize}px;line-height:1.25;${alignment}">${richText}</h1>`;
    case 'text':
      return `<p style="margin:0 0 20px;color:${design.secondaryText};font-family:${font},sans-serif;font-size:${fontSize}px;line-height:1.6;${alignment}">${richText}</p>`;
    case 'image':
      if (!isAllowedUrl(block.url, false)) return '';
      return `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" width="640" style="display:block;width:100%;max-width:640px;height:auto;margin:0 auto 20px;border:0;" />`;
    case 'button':
      if (!isAllowedUrl(block.url, true)) {
        return `<div style="margin:0 0 20px;${alignment}"><span style="display:inline-block;padding:12px 22px;border-radius:${design.buttonRadius}px;background:${design.buttonColor};color:#ffffff;font-family:${font},sans-serif;font-size:${fontSize}px;font-weight:bold;">${text}</span></div>`;
      }
      return `<div style="margin:0 0 20px;${alignment}"><a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 22px;border-radius:${design.buttonRadius}px;background:${design.buttonColor};color:#ffffff;font-family:${font},sans-serif;font-size:${fontSize}px;font-weight:bold;text-decoration:none;">${text}</a></div>`;
    case 'divider':
      return '<hr style="margin:20px 0;border:0;border-top:1px solid #e4e7ec;" />';
    case 'spacer':
      return '<div style="height:24px;line-height:24px;font-size:1px;">&nbsp;</div>';
    case 'footer':
      return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e4e7ec;color:${design.secondaryText};font-family:${font},sans-serif;font-size:${fontSize}px;line-height:1.6;${alignment}">${richText}</div>`;
  }
}

export const renderEmailBlock = renderBlock;

export interface RenderedEmail {
  html: string;
  text: string;
}

export function renderEmailCampaign(
  subject: string,
  preheader: string,
  blocks: EmailBlock[],
  unsubscribeUrl?: string,
  design: EmailDesignSettings = DEFAULT_EMAIL_DESIGN
): RenderedEmail {
  const content = blocks.map((block) => renderBlock(block, design)).join('');
  const unsubscribeHtml = unsubscribeUrl
    ? `<p style="margin:24px 0 0;color:#667085;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;text-align:center;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#667085;text-decoration:underline;">Cancelar inscrição</a></p>`
    : '';
  const unsubscribeText = unsubscribeUrl
    ? `Para cancelar a inscrição, acesse: ${unsubscribeUrl}`
    : '';
  const visibleText = blocks
    .map((block) => {
      if (block.type === 'image') {
        return block.url ? block.alt || '[Imagem]' : '';
      }
      if (block.type === 'button') {
        return [block.text, block.url].filter(Boolean).join('\n');
      }
      if (block.type === 'divider') return '--------------------';
      if (block.type === 'spacer') return '';
      return renderPlainText(block.text);
    })
    .filter((text) => text.trim())
    .join('\n\n');

  return {
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px;background:${design.emailBackground};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border-collapse:collapse;background:${design.sectionBackground};border-radius:${design.cornerRadius}px;"><tr><td style="padding:${design.sectionSpacing}px;font-family:${design.fontFamily},sans-serif;">${content}${unsubscribeHtml}</td></tr></table></td></tr></table></body></html>`,
    text: [preheader, visibleText, unsubscribeText]
      .filter((text) => text.trim())
      .join('\n\n'),
  };
}
