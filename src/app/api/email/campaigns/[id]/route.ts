import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { validateEmailCampaignDraft } from '@/lib/email-campaigns/validation';
import { validateEmailCampaignReferences } from '@/lib/email-campaigns/references';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMPAIGN_COLUMNS =
  'id, sender_connection_id, name, subject, preheader, audience_type, audience_contact_ids, audience_pipeline_id, audience_stage_id, content_json, status, scheduled_at, sent_count, updated_at';

export async function GET(
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
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('email_campaigns')
      .select(CAMPAIGN_COLUMNS)
      .eq('id', id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (error) {
      console.error('[email-campaigns] load failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível carregar a campanha.' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    }
    const { data: recipientCount, error: recipientCountError } = await admin
      .from('email_campaign_recipient_counts')
      .select('member_count')
      .eq('campaign_id', data.id)
      .maybeSingle();
    if (recipientCountError) {
      console.error(
        '[email-campaigns] recipient count lookup failed:',
        recipientCountError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar o tamanho do público.' },
        { status: 500 }
      );
    }
    const { data: sender, error: senderError } = await admin
      .from('email_sender_connections')
      .select('id, name, from_email')
      .eq('id', data.sender_connection_id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (senderError) {
      console.error(
        '[email-campaigns] sender lookup failed:',
        senderError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar o remetente.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        campaign: {
          ...data,
          audience_member_count: recipientCount?.member_count ?? 0,
          sender: sender ?? null,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corpo JSON inválido.' },
        { status: 400 }
      );
    }
    const validation = validateEmailCampaignDraft(body);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const input = validation.input;
    const referenceError = await validateEmailCampaignReferences(
      supabaseAdmin(),
      context.accountId,
      input
    );
    if (referenceError) {
      return NextResponse.json({ error: referenceError }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: existing, error: lookupError } = await admin
      .from('email_campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (lookupError) {
      console.error(
        '[email-campaigns] update lookup failed:',
        lookupError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar a campanha.' },
        { status: 500 }
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    }
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'Somente rascunhos podem ser editados.' },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from('email_campaigns')
      .update({
        sender_connection_id: input.senderConnectionId,
        name: input.name,
        subject: input.subject,
        preheader: input.preheader,
        audience_type: input.audienceType,
        audience_contact_ids: input.audienceContactIds,
        audience_pipeline_id: input.audiencePipelineId,
        audience_stage_id: input.audienceStageId,
        content_json: {
          version: 1,
          blocks: input.content,
          design: input.design,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('account_id', context.accountId)
      .eq('status', 'draft')
      .select(CAMPAIGN_COLUMNS)
      .single();
    if (error) {
      console.error('[email-campaigns] update failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível atualizar o rascunho.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ campaign: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
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
    const { data, error } = await supabaseAdmin()
      .from('email_campaigns')
      .delete()
      .eq('id', id)
      .eq('account_id', context.accountId)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[email-campaigns] delete failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível excluir o rascunho.' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Rascunho não encontrado ou não pode ser excluído.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
