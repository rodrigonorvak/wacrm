import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { resolveInviteBaseUrl } from '@/lib/auth/invite-base-url';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { decryptSenderPassword } from '@/lib/email-senders/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  validateEmailCampaignDraft,
  validateEmailCampaignReadyToSend,
} from '@/lib/email-campaigns/validation';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseScheduledAt(value: unknown): Date | null {
  if (value === undefined || value === null) return new Date();
  if (typeof value !== 'string' || !value.trim()) return null;

  const scheduledAt = new Date(value);
  if (!Number.isFinite(scheduledAt.getTime())) return null;
  if (scheduledAt.getTime() < Date.now() + 60_000) return null;
  if (scheduledAt.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    return null;
  }
  return scheduledAt;
}

export async function POST(
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
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Dados de agendamento inválidos.' },
        { status: 400 }
      );
    }

    const scheduledAt = parseScheduledAt(
      'scheduledAt' in body ? body.scheduledAt : undefined
    );
    if (!scheduledAt) {
      return NextResponse.json(
        {
          error:
            'Escolha um horário pelo menos um minuto no futuro e dentro do próximo ano.',
        },
        { status: 400 }
      );
    }
    if (!resolveInviteBaseUrl(request)) {
      return NextResponse.json(
        {
          error:
            'Configure NEXT_PUBLIC_SITE_URL ou ALLOWED_INVITE_HOSTS antes de agendar campanhas.',
        },
        { status: 503 }
      );
    }

    const admin = supabaseAdmin();
    const { data: campaign, error: campaignError } = await admin
      .from('email_campaigns')
      .select(
        'id, sender_connection_id, name, subject, preheader, audience_type, audience_contact_ids, audience_pipeline_id, audience_stage_id, content_json, status'
      )
      .eq('id', id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (campaignError) {
      console.error(
        '[email-campaigns/send] campaign lookup failed:',
        campaignError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar a campanha.' },
        { status: 500 }
      );
    }
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    }
    if (campaign.status !== 'draft') {
      return NextResponse.json(
        { error: 'Somente rascunhos podem ser enviados ou agendados.' },
        { status: 409 }
      );
    }

    const validation = validateEmailCampaignDraft({
      senderConnectionId: campaign.sender_connection_id,
      name: campaign.name,
      subject: campaign.subject,
      preheader: campaign.preheader,
      audienceType: campaign.audience_type,
      audienceContactIds: campaign.audience_contact_ids,
      audiencePipelineId: campaign.audience_pipeline_id,
      audienceStageId: campaign.audience_stage_id,
      content: campaign.content_json,
    });
    if ('error' in validation) {
      console.error(
        '[email-campaigns/send] stored campaign failed validation:',
        validation.error
      );
      return NextResponse.json(
        { error: 'Revise os dados salvos da campanha antes do envio.' },
        { status: 409 }
      );
    }
    const readyToSendError = validateEmailCampaignReadyToSend(validation.input);
    if (readyToSendError) {
      return NextResponse.json({ error: readyToSendError }, { status: 400 });
    }

    const { data: sender, error: senderError } = await admin
      .from('email_sender_connections')
      .select('id, encrypted_password')
      .eq('id', campaign.sender_connection_id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (senderError) {
      console.error(
        '[email-campaigns/send] sender lookup failed:',
        senderError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar o remetente da campanha.' },
        { status: 500 }
      );
    }
    if (!sender) {
      return NextResponse.json(
        { error: 'O remetente da campanha não está mais disponível.' },
        { status: 409 }
      );
    }
    try {
      decryptSenderPassword(sender.encrypted_password);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown decryption error';
      console.error(
        '[email-campaigns/send] credential decrypt failed:',
        message
      );
      return NextResponse.json(
        {
          error: message.startsWith('ENCRYPTION_KEY')
            ? 'O servidor precisa ter a variável ENCRYPTION_KEY configurada para usar este remetente.'
            : 'Não foi possível descriptografar a credencial. Verifique se a ENCRYPTION_KEY não foi alterada.',
        },
        { status: 503 }
      );
    }

    const { data: queuedCount, error: queueError } = await admin.rpc(
      'prepare_email_campaign_delivery',
      {
        p_campaign_id: id,
        p_account_id: context.accountId,
        p_scheduled_at: scheduledAt.toISOString(),
      }
    );
    if (queueError) {
      if (queueError.message.includes('campaign_not_found')) {
        return NextResponse.json(
          { error: 'Campanha não encontrada.' },
          { status: 404 }
        );
      }
      if (queueError.message.includes('campaign_not_draft')) {
        return NextResponse.json(
          { error: 'A campanha já foi enviada ou agendada.' },
          { status: 409 }
        );
      }
      if (queueError.message.includes('campaign_empty_audience')) {
        return NextResponse.json(
          {
            error:
              'Nenhum contato com e-mail válido foi encontrado no público desta campanha.',
          },
          { status: 422 }
        );
      }
      if (queueError.message.includes('invalid_schedule')) {
        return NextResponse.json(
          { error: 'O horário de envio não é válido.' },
          { status: 400 }
        );
      }
      console.error(
        '[email-campaigns/send] delivery queue preparation failed:',
        queueError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível preparar o envio da campanha.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        status: 'scheduled',
        queuedCount: Number(queuedCount ?? 0),
        scheduledAt: scheduledAt.toISOString(),
      },
      { status: 202 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
