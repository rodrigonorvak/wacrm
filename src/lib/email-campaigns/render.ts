import type { EmailBlock } from './types';

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

function renderBlock(block: EmailBlock): string {
  const alignment = `text-align:${block.alignment};`;
  const text = renderText(block.text);

  switch (block.type) {
    case 'heading':
      return `<h1 style="margin:0 0 20px;color:#172033;font-family:Arial,sans-serif;font-size:28px;line-height:1.25;${alignment}">${text}</h1>`;
    case 'text':
      return `<p style="margin:0 0 20px;color:#344054;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;${alignment}">${text}</p>`;
    case 'image':
      if (!block.url.trim()) return '';
      return `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" width="640" style="display:block;width:100%;max-width:640px;height:auto;margin:0 auto 20px;border:0;" />`;
    case 'button':
      if (!block.url.trim()) {
        return `<div style="margin:0 0 20px;${alignment}"><span style="display:inline-block;padding:12px 22px;border-radius:6px;background:#c026d3;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${text}</span></div>`;
      }
      return `<div style="margin:0 0 20px;${alignment}"><a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 22px;border-radius:6px;background:#c026d3;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;">${text}</a></div>`;
    case 'divider':
      return '<hr style="margin:20px 0;border:0;border-top:1px solid #e4e7ec;" />';
    case 'spacer':
      return '<div style="height:24px;line-height:24px;font-size:1px;">&nbsp;</div>';
    case 'footer':
      return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e4e7ec;color:#667085;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;${alignment}">${text}</div>`;
  }
}

export interface RenderedEmail {
  html: string;
  text: string;
}

export function renderEmailCampaign(
  subject: string,
  preheader: string,
  blocks: EmailBlock[],
  unsubscribeUrl?: string
): RenderedEmail {
  const content = blocks.map(renderBlock).join('');
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
      return block.text;
    })
    .filter((text) => text.trim())
    .join('\n\n');

  return {
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px;background:#f2f4f7;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border-collapse:collapse;background:#ffffff;"><tr><td style="padding:32px;">${content}${unsubscribeHtml}</td></tr></table></td></tr></table></body></html>`,
    text: [preheader, visibleText, unsubscribeText]
      .filter((text) => text.trim())
      .join('\n\n'),
  };
}
