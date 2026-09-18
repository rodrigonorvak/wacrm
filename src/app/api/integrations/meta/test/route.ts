import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { decrypt } from '@/lib/whatsapp/encryption';

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as { source_type?: unknown } | null;
    const sourceType = body?.source_type;
    if (sourceType !== 'elementor' && sourceType !== 'meta_instant_form') {
      return NextResponse.json({ error: 'Invalid source_type' }, { status: 400 });
    }

    const { data: integration } = await supabase
      .from('meta_integrations')
      .select('id, dataset_id, api_version, access_token_encrypted')
      .eq('account_id', accountId)
      .eq('source_type', sourceType)
      .maybeSingle();
    if (!integration) return NextResponse.json({ error: 'Meta integration not configured' }, { status: 404 });

    const accessToken = decrypt(integration.access_token_encrypted);
    const response = await fetch(
      `https://graph.facebook.com/${integration.api_version}/${integration.dataset_id}?fields=id&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof (result.error as Record<string, unknown> | undefined)?.message === 'string'
        ? (result.error as Record<string, unknown>).message
        : `Meta API returned ${response.status}`;
      await supabase.from('meta_integrations').update({ is_active: false, last_error: message }).eq('id', integration.id);
      return NextResponse.json({ connected: false, error: message }, { status: 502 });
    }

    await supabase.from('meta_integrations').update({
      is_active: true,
      last_tested_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', integration.id);
    return NextResponse.json({ connected: true, dataset_id: integration.dataset_id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
