import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmailUnsubscribeLink,
  createEmailUnsubscribeToken,
  hashEmailAddress,
  verifyEmailUnsubscribeToken,
} from './unsubscribe';

const accountId = '00000000-0000-4000-8000-000000000010';
const campaignId = '00000000-0000-4000-8000-000000000020';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('email unsubscribe tokens', () => {
  it('creates a signed token for an account-scoped normalized address', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64));
    const token = createEmailUnsubscribeToken(
      accountId,
      ' Person@Example.com ',
      campaignId
    );
    const claims = verifyEmailUnsubscribeToken(token);

    expect(claims).toEqual({
      accountId,
      addressHash: hashEmailAddress(accountId, 'person@example.com'),
      sourceCampaignId: campaignId,
    });
    expect(hashEmailAddress(accountId, 'person@example.com')).not.toBe(
      hashEmailAddress(
        '00000000-0000-4000-8000-000000000011',
        'person@example.com'
      )
    );
  });

  it('rejects tokens whose signed payload was modified', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64));
    const token = createEmailUnsubscribeToken(accountId, 'person@example.com');
    const [payload, signature] = token.split('.');
    const changedPayload = `${payload.slice(0, -1)}${payload.endsWith('a') ? 'b' : 'a'}`;

    expect(
      verifyEmailUnsubscribeToken(`${changedPayload}.${signature}`)
    ).toBeNull();
  });

  it('does not expose the email address and creates one-click headers', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64));
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://crm.example/');
    const link = createEmailUnsubscribeLink(
      new Request('https://untrusted.example/api/send'),
      accountId,
      'person@example.com',
      campaignId
    );

    expect(link.token).not.toContain('person@example.com');
    expect(link.url).toMatch(
      /^https:\/\/crm\.example\/email\/unsubscribe\?token=/
    );
    expect(link.headers).toEqual({
      'List-Unsubscribe': `<https://crm.example/api/email/unsubscribe?token=${encodeURIComponent(link.token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});
