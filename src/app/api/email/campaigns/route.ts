import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { validateEmailCampaignDraft } from '@/lib/email-campaigns/validation';
import { validateEmailCampaignReferences } from '@/lib/email-campaigns/references';

export const runtime = 'nodejs';
const CAMPAIGN_COLUMNS =
  'id, sender_connection_id, name, subject, preheader, audience_type, audience_contact_ids, audience_pipeline_id, audience_stage_id, content_json, status, scheduled_at, sent_count, updated_at';

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

    const [failedDeliveries, unsubscribeCount] = await Promise.all([
      admin
        .from('email_campaign_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', context.accountId)
        .eq('status', 'failed'),
      admin
        .from('email_unsubscribes')
        .select('address_hash', { count: 'exact', head: true })
        .eq('account_id', context.accountId),
    ]);
    if (failedDeliveries.error || unsubscribeCount.error) {
      console.error(
        '[email-campaigns] summary metrics lookup failed:',
        failedDeliveries.error?.message ?? unsubscribeCount.error?.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar as métricas das campanhas.' },
        { status: 500 }
      );
    }

    const campaignIds = (data ?? []).map((campaign) => campaign.id);
    const { data: recipientCounts, error: recipientCountsError } =
      campaignIds.length
        ? await admin
            .from('email_campaign_recipient_counts')
            .select('campaign_id, member_count')
            .in('campaign_id', campaignIds)
        : { data: [], error: null };
    if (recipientCountsError) {
      console.error(
        '[email-campaigns] recipient count lookup failed:',
        recipientCountsError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar o tamanho do público.' },
        { status: 500 }
      );
    }

    const recipientCountByCampaignId = new Map(
      (recipientCounts ?? []).map((count) => [
        count.campaign_id,
        count.member_count,
      ])
    );
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
          audience_member_count:
            recipientCountByCampaignId.get(campaign.id) ?? 0,
          sender: senderById.get(campaign.sender_connection_id) ?? null,
        })),
        metrics: {
          sent: (data ?? []).reduce(
            (sum, campaign) => sum + (campaign.sent_count ?? 0),
            0
          ),
          failed: failedDeliveries.count ?? 0,
          unsubscribed: unsubscribeCount.count ?? 0,
        },
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
        content_json: {
          version: 1,
          blocks: input.content,
          design: input.design,
        },
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
