import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const sourceType = new URL(request.url).searchParams.get('source_type');
    let query = supabase
      .from('meta_conversion_events')
      .select('id, integration_id, event_name, event_id, status, error_message, attempts, sent_at, created_at, source:meta_integrations(source_type)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (sourceType === 'elementor' || sourceType === 'meta_instant_form') {
      query = query.eq('meta_integrations.source_type', sourceType);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
