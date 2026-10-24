import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  validateEmailCampaignDraft,
  validateEmailCampaignReadyToSend,
} from '@/lib/email-campaigns/validation';

export const runtime = 'nodejs';

const TEMPLATE_COLUMNS =
  'id, sender_connection_id, name, subject, preheader, content_json, created_at, updated_at';

export async function GET() {
  try {
    const context = await requireEmailSenderAdmin();
    const { data, error } = await supabaseAdmin()
      .from('email_automation_templates')
      .select(TEMPLATE_COLUMNS)
      .eq('account_id', context.accountId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[email-templates] list failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível carregar os modelos de e-mail.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { templates: data ?? [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireEmailSenderAdmin();
    const body = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Dados do modelo inválidos.' },
        { status: 400 }
      );
    }

    const record = body as Record<string, unknown>;
    const validation = validateEmailCampaignDraft({
      senderConnectionId: record.senderConnectionId,
      name: record.name,
      subject: record.subject,
      preheader: record.preheader,
      audienceType: 'all_contacts',
      audienceContactIds: [],
      audiencePipelineId: null,
      audienceStageId: null,
      content: record.content,
      design: record.design,
    });
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const readyError = validateEmailCampaignReadyToSend(validation.input);
    if (readyError) {
      return NextResponse.json({ error: readyError }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: sender, error: senderError } = await admin
      .from('email_sender_connections')
      .select('id')
      .eq('id', validation.input.senderConnectionId)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (senderError) {
      console.error(
        '[email-templates] sender lookup failed:',
        senderError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível validar o remetente.' },
        { status: 500 }
      );
    }
    if (!sender) {
      return NextResponse.json(
        { error: 'O remetente selecionado não está disponível nesta conta.' },
        { status: 400 }
      );
    }

    const input = validation.input;
    const { data, error } = await admin
      .from('email_automation_templates')
      .insert({
        account_id: context.accountId,
        created_by: context.userId,
        sender_connection_id: input.senderConnectionId,
        name: input.name,
        subject: input.subject,
        preheader: input.preheader,
        content_json: { blocks: input.content, design: input.design },
      })
      .select(TEMPLATE_COLUMNS)
      .single();
    if (error || !data) {
      console.error('[email-templates] create failed:', error?.message);
      return NextResponse.json(
        { error: 'Não foi possível salvar o modelo de e-mail.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
