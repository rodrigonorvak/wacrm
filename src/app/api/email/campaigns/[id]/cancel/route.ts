import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireEmailSenderAdmin();
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin().rpc(
      'cancel_email_campaign_delivery',
      {
        p_campaign_id: id,
        p_account_id: context.accountId,
      }
    );
    if (error) {
      console.error(
        '[email-campaigns/cancel] scheduled campaign cancellation failed:',
        error.message
      );
      return NextResponse.json(
        { error: 'Não foi possível cancelar o agendamento.' },
        { status: 500 }
      );
    }
    if (data !== true) {
      return NextResponse.json(
        {
          error:
            'A campanha não está mais agendada ou o envio já foi iniciado.',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, status: 'draft' });
  } catch (error) {
    return toErrorResponse(error);
  }
}
