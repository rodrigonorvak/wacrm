import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveInviteBaseUrl } from '@/lib/auth/invite-base-url';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailUnsubscribeClaims {
  accountId: string;
  addressHash: string;
  sourceCampaignId: string | null;
}

function getUnsubscribeKey(
  purpose: 'address-hash' | 'token-signature'
): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hexadecimal key');
  }
  return crypto
    .createHmac('sha256', Buffer.from(keyHex, 'hex'))
    .update(`wacrm/email-unsubscribe/${purpose}/v1`)
    .digest();
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized) ||
    /[\r\n]/.test(normalized)
  ) {
    throw new Error('A valid email address is required');
  }
  return normalized;
}

export function hashEmailAddress(accountId: string, email: string): string {
  if (!UUID_PATTERN.test(accountId)) {
    throw new Error('A valid account ID is required');
  }
  return crypto
    .createHmac('sha256', getUnsubscribeKey('address-hash'))
    .update(`${accountId.toLowerCase()}\0${normalizeEmail(email)}`)
    .digest('hex');
}

export function createEmailUnsubscribeToken(
  accountId: string,
  email: string,
  sourceCampaignId: string | null = null
): string {
  if (!UUID_PATTERN.test(accountId)) {
    throw new Error('A valid account ID is required');
  }
  if (sourceCampaignId !== null && !UUID_PATTERN.test(sourceCampaignId)) {
    throw new Error('A valid campaign ID is required');
  }

  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      accountId: accountId.toLowerCase(),
      addressHash: hashEmailAddress(accountId, email),
      sourceCampaignId: sourceCampaignId?.toLowerCase() ?? null,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getUnsubscribeKey('token-signature'))
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyEmailUnsubscribeToken(
  token: string
): EmailUnsubscribeClaims | null {
  const [payload, signature, ...extra] = token.split('.');
  if (
    !payload ||
    !signature ||
    extra.length > 0 ||
    token.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  ) {
    return null;
  }

  const expected = crypto
    .createHmac('sha256', getUnsubscribeKey('token-signature'))
    .update(payload)
    .digest();
  const actual = Buffer.from(signature, 'base64url');
  if (
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  ) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    Array.isArray(decoded)
  ) {
    return null;
  }

  const claims = decoded as Record<string, unknown>;
  if (
    claims.version !== 1 ||
    typeof claims.accountId !== 'string' ||
    !UUID_PATTERN.test(claims.accountId) ||
    typeof claims.addressHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(claims.addressHash) ||
    (claims.sourceCampaignId !== null &&
      (typeof claims.sourceCampaignId !== 'string' ||
        !UUID_PATTERN.test(claims.sourceCampaignId)))
  ) {
    return null;
  }

  return {
    accountId: claims.accountId,
    addressHash: claims.addressHash,
    sourceCampaignId: claims.sourceCampaignId,
  };
}

export function createEmailUnsubscribeUrl(
  baseUrl: string,
  token: string
): string {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    throw new Error('The unsubscribe URL must use HTTP or HTTPS');
  }
  return `${base.origin}/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function createEmailOneClickUnsubscribeUrl(
  baseUrl: string,
  token: string
): string {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    throw new Error('The unsubscribe URL must use HTTP or HTTPS');
  }
  return `${base.origin}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function createEmailUnsubscribeLink(
  request: Request,
  accountId: string,
  email: string,
  sourceCampaignId: string | null = null
): { token: string; url: string; headers: Record<string, string> } {
  const baseUrl = resolveInviteBaseUrl(request);
  if (!baseUrl) {
    throw new Error(
      'Configure NEXT_PUBLIC_SITE_URL or ALLOWED_INVITE_HOSTS to create unsubscribe links'
    );
  }

  const token = createEmailUnsubscribeToken(accountId, email, sourceCampaignId);
  const url = createEmailUnsubscribeUrl(baseUrl, token);
  const oneClickUrl = createEmailOneClickUnsubscribeUrl(baseUrl, token);
  return {
    token,
    url,
    headers: createEmailUnsubscribeHeaders(oneClickUrl),
  };
}

export function createEmailUnsubscribeHeaders(
  unsubscribeUrl: string
): Record<string, string> {
  const url = new URL(unsubscribeUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The unsubscribe URL must use HTTP or HTTPS');
  }
  return {
    'List-Unsubscribe': `<${url.toString()}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export async function getUnsubscribedAddressHashes(
  admin: SupabaseClient,
  accountId: string,
  emails: string[]
): Promise<Set<string>> {
  const addressHashes = [
    ...new Set(emails.map((email) => hashEmailAddress(accountId, email))),
  ];
  const unsubscribedHashes = new Set<string>();

  for (let start = 0; start < addressHashes.length; start += 500) {
    const batch = addressHashes.slice(start, start + 500);
    const { data, error } = await admin
      .from('email_unsubscribes')
      .select('address_hash')
      .eq('account_id', accountId)
      .in('address_hash', batch);
    if (error) throw error;
    for (const row of data ?? []) {
      unsubscribedHashes.add(row.address_hash);
    }
  }

  return unsubscribedHashes;
}

export async function isEmailAddressUnsubscribed(
  admin: SupabaseClient,
  accountId: string,
  email: string
): Promise<boolean> {
  const hash = hashEmailAddress(accountId, email);
  return (await getUnsubscribedAddressHashes(admin, accountId, [email])).has(
    hash
  );
}
