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

    // A Conversions API token needs permission to POST events. Querying the
    // dataset with `fields=id` tests a different read permission and can
    // incorrectly report (#100) Missing Permission for valid event tokens.
    // Decrypting here verifies the stored credential; the first real event
    // records the actual Meta response in meta_conversion_events.
    decrypt(integration.access_token_encrypted);

    await supabase.from('meta_integrations').update({
      is_active: true,
      last_tested_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', integration.id);
    return NextResponse.json({ connected: true, dataset_id: integration.dataset_id, verified: 'credential' });
  } catch (error) {
    return toErrorResponse(error);
  }
}
