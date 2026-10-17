import { describe, expect, it } from 'vitest';
import { renderEmailCampaign } from './render';

describe('email campaign renderer', () => {
  it('renders supported blocks as email-safe HTML and plain text', () => {
    const rendered = renderEmailCampaign('Novidades', 'Veja as novidades', [
      {
        id: 'heading',
        type: 'heading',
        text: 'Olá, pessoa',
        url: '',
        alt: '',
        alignment: 'center',
      },
      {
        id: 'button',
        type: 'button',
        text: 'Acessar',
        url: 'https://example.com/oferta',
        alt: '',
        alignment: 'center',
      },
      {
        id: 'footer',
        type: 'footer',
        text: 'Malybo',
        url: '',
        alt: '',
        alignment: 'center',
      },
    ]);

    expect(rendered.html).toContain('<h1');
    expect(rendered.html).toContain('href="https://example.com/oferta"');
    expect(rendered.text).toContain('Veja as novidades');
    expect(rendered.text).toContain('https://example.com/oferta');
  });

  it('escapes user-controlled text and URLs before inserting HTML', () => {
    const rendered = renderEmailCampaign('', '', [
      {
        id: 'text',
        type: 'text',
        text: '<script>alert("x")</script>',
        url: '',
        alt: '',
        alignment: 'left',
      },
      {
        id: 'image',
        type: 'image',
        text: '',
        url: 'https://example.com/image?a=1&b=2',
        alt: '" onerror="alert(1)',
        alignment: 'left',
      },
    ]);

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain('&amp;b=2');
    expect(rendered.html).toContain('&quot; onerror=&quot;');
  });

  it('does not emit broken image sources or empty button links', () => {
    const rendered = renderEmailCampaign('', '', [
      {
        id: 'image',
        type: 'image',
        text: '',
        url: '',
        alt: '',
        alignment: 'left',
      },
      {
        id: 'button',
        type: 'button',
        text: 'Saiba mais',
        url: '',
        alt: '',
        alignment: 'center',
      },
    ]);

    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).not.toContain('href=""');
    expect(rendered.html).toContain('Saiba mais');
  });

  it('adds a plain-text and HTML unsubscribe link when provided', () => {
    const rendered = renderEmailCampaign(
      'Novidades',
      '',
      [],
      'https://crm.example.com/email/unsubscribe?token=signed'
    );

    expect(rendered.html).toContain(
      'href="https://crm.example.com/email/unsubscribe?token=signed"'
    );
    expect(rendered.html).toContain('Cancelar inscrição');
    expect(rendered.text).toContain(
      'https://crm.example.com/email/unsubscribe?token=signed'
    );
  });
});
