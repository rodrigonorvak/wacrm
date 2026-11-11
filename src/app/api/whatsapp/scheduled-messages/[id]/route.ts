import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { accountId } = await requireRole('agent');
    const { id } = await params;
    const { data, error } = await supabaseAdmin().from('scheduled_whatsapp_messages')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('account_id', accountId).eq('id', id).eq('status', 'pending')
      .select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Agendamento não encontrado ou não pode ser cancelado.' }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
