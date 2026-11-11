import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  editMessageTemplate,
  MetaTemplateApiError,
  submitMessageTemplate,
} from './meta-api';

afterEach(() => vi.unstubAllGlobals());

describe('template Meta API errors', () => {
  it.each(['submit', 'edit'] as const)(
    'preserves diagnostic details returned by Meta when attempting to %s',
    async (operation) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                message: 'Invalid parameter',
                code: 100,
                error_subcode: 42,
                error_user_msg: 'Please correct the button.',
                error_data: { details: 'Button URL is invalid.' },
                fbtrace_id: 'trace123',
              },
            }),
            { status: 400 }
          )
        )
      );
      const request =
        operation === 'submit'
          ? submitMessageTemplate({
              wabaId: 'waba',
              accessToken: 'token',
              payload: {
                name: 'template',
                category: 'MARKETING',
                language: 'pt_BR',
                components: [{ type: 'BODY', text: 'Hello' }],
              },
            })
          : editMessageTemplate({
              metaTemplateId: 'template',
              accessToken: 'token',
              components: [{ type: 'BODY', text: 'Hello' }],
            });

      await expect(request).rejects.toThrow(
        'Invalid parameter — Please correct the button. — Button URL is invalid. — (code 100, subcode 42, trace trace123)'
      );
    }
  );

  it('retains the HTTP status when Meta returns non-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('unavailable', { status: 429 }))
    );
    const request = submitMessageTemplate({
      wabaId: 'waba',
      accessToken: 'token',
      payload: {
        name: 'template',
        category: 'MARKETING',
        language: 'pt_BR',
        components: [{ type: 'BODY', text: 'Hello' }],
      },
    });
    await expect(request).rejects.toMatchObject({
      name: 'MetaTemplateApiError',
      message: 'Meta API error: 429',
      status: 429,
    } satisfies Partial<MetaTemplateApiError>);
  });
});
