import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { validateEmailCampaignDraft } from '@/lib/email-campaigns/validation';
import { validateEmailCampaignReferences } from '@/lib/email-campaigns/references';

export const runtime = 'nodejs';
const CAMPAIGN_COLUMNS =
  'id, sender_connection_id, name, subject, preheader, audience_type, audience_contact_ids, audience_pipeline_id, audience_stage_id, content_json, status, updated_at';

export async function GET() {
  try {
    const context = await requireEmailSenderAdmin();
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('email_campaigns')
      .select(CAMPAIGN_COLUMNS)
      .eq('account_id', context.accountId)
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('[email-campaigns] list failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível carregar as campanhas.' },
        { status: 500 }
      );
    }

    const senderIds = [
      ...new Set((data ?? []).map((campaign) => campaign.sender_connection_id)),
    ];
    const { data: senders, error: sendersError } = senderIds.length
      ? await admin
          .from('email_sender_connections')
          .select('id, name, from_email')
          .eq('account_id', context.accountId)
          .in('id', senderIds)
      : { data: [], error: null };
    if (sendersError) {
      console.error(
        '[email-campaigns] sender lookup failed:',
        sendersError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar os remetentes das campanhas.' },
        { status: 500 }
      );
    }
    const senderById = new Map(
      (senders ?? []).map((sender) => [sender.id, sender])
    );

    return NextResponse.json(
      {
        campaigns: (data ?? []).map((campaign) => ({
          ...campaign,
          sender: senderById.get(campaign.sender_connection_id) ?? null,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireEmailSenderAdmin();
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

    const referenceError = await validateEmailCampaignReferences(
      supabaseAdmin(),
      context.accountId,
      validation.input
    );
    if (referenceError) {
      return NextResponse.json({ error: referenceError }, { status: 400 });
    }

    const input = validation.input;
    const { data, error } = await supabaseAdmin()
      .from('email_campaigns')
      .insert({
        account_id: context.accountId,
        created_by: context.userId,
        sender_connection_id: input.senderConnectionId,
        name: input.name,
        subject: input.subject,
        preheader: input.preheader,
        audience_type: input.audienceType,
        audience_contact_ids: input.audienceContactIds,
        audience_pipeline_id: input.audiencePipelineId,
        audience_stage_id: input.audienceStageId,
        content_json: input.content,
        status: 'draft',
      })
      .select(CAMPAIGN_COLUMNS)
      .single();
    if (error) {
      console.error('[email-campaigns] create failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível salvar o rascunho da campanha.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
