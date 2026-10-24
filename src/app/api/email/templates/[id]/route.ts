import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireEmailSenderAdmin();
    const { id } = await params;
    const { data, error } = await supabaseAdmin()
      .from('email_automation_templates')
      .select(
        'id, sender_connection_id, name, subject, preheader, content_json, created_at, updated_at'
      )
      .eq('id', id)
      .eq('account_id', context.accountId)
      .maybeSingle();

    if (error) {
      console.error('[email-templates] lookup failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível carregar o modelo de e-mail.' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Modelo de e-mail não encontrado.' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { template: data },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
