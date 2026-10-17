import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { verifyEmailUnsubscribeToken } from '@/lib/email-campaigns/unsubscribe';

export const runtime = 'nodejs';

function getClientIp(request: Request): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown';
  return ip.slice(0, 64);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return NextResponse.json(
      { error: 'Pedido de descadastro muito grande.' },
      { status: 413 }
    );
  }

  const limit = checkRateLimit(
    `email-unsubscribe:${getClientIp(request)}`,
    RATE_LIMITS.emailUnsubscribe
  );
  if (!limit.success) return rateLimitResponse(limit);

  const queryToken = new URL(request.url).searchParams.get('token') ?? '';
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  let token = queryToken;

  try {
    if (contentType.includes('application/json')) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Corpo JSON inválido.' },
          { status: 400 }
        );
      }
      const bodyToken =
        typeof body === 'object' &&
        body !== null &&
        'token' in body &&
        typeof body.token === 'string'
          ? body.token
          : '';
      if (queryToken && bodyToken && queryToken !== bodyToken) {
        return NextResponse.json(
          { error: 'Link de descadastro inválido.' },
          { status: 400 }
        );
      }
      token = bodyToken || queryToken;
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return NextResponse.json(
          { error: 'Corpo do pedido inválido.' },
          { status: 400 }
        );
      }
      if (form.get('List-Unsubscribe') !== 'One-Click') {
        return NextResponse.json(
          { error: 'Pedido de descadastro inválido.' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Formato de pedido não suportado.' },
        { status: 415 }
      );
    }

    if (!token || token.length > 2048) {
      return NextResponse.json(
        { error: 'Link de descadastro inválido.' },
        { status: 400 }
      );
    }

    let claims;
    try {
      claims = verifyEmailUnsubscribeToken(token);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('ENCRYPTION_KEY')
      ) {
        console.error('[email-unsubscribe] token key is not configured');
        return NextResponse.json(
          { error: 'O descadastro está temporariamente indisponível.' },
          { status: 503 }
        );
      }
      throw error;
    }
    if (!claims) {
      return NextResponse.json(
        { error: 'Link de descadastro inválido.' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin().from('email_unsubscribes').upsert(
      {
        account_id: claims.accountId,
        address_hash: claims.addressHash,
        source_campaign_id: claims.sourceCampaignId,
      },
      {
        onConflict: 'account_id,address_hash',
        ignoreDuplicates: true,
      }
    );
    if (error) {
      console.error(
        '[email-unsubscribe] suppression insert failed:',
        error.message
      );
      return NextResponse.json(
        { error: 'Não foi possível registrar o descadastro.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
