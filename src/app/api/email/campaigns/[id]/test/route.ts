import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { decryptSenderPassword } from '@/lib/email-senders/encryption';
import { sendEmailThroughSender } from '@/lib/email-senders/smtp';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { renderEmailCampaign } from '@/lib/email-campaigns/render';
import {
  validateEmailCampaignDraft,
  validateEmailCampaignReadyToSend,
} from '@/lib/email-campaigns/validation';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface EmailSenderRow {
  id: string;
  name: string;
  from_email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_secure: boolean;
  encrypted_password: string;
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

    const limit = checkRateLimit(
      `email-sender-test:${context.accountId}`,
      RATE_LIMITS.emailSenderTest
    );
    if (!limit.success) return rateLimitResponse(limit);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corpo JSON inválido.' },
        { status: 400 }
      );
    }
    const to =
      typeof body === 'object' &&
      body !== null &&
      'to' in body &&
      typeof body.to === 'string'
        ? body.to.trim()
        : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) {
      return NextResponse.json(
        { error: 'Informe um e-mail válido para receber o teste.' },
        { status: 400 }
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
        '[email-campaigns/test] campaign lookup failed:',
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
        { error: 'O teste só pode ser enviado para um rascunho.' },
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
        '[email-campaigns/test] stored campaign failed validation:',
        validation.error
      );
      return NextResponse.json(
        { error: 'Revise o conteúdo salvo antes de enviar o teste.' },
        { status: 409 }
      );
    }
    const readyToSendError = validateEmailCampaignReadyToSend(validation.input);
    if (readyToSendError) {
      return NextResponse.json({ error: readyToSendError }, { status: 400 });
    }

    const { data: sender, error: senderError } = await admin
      .from('email_sender_connections')
      .select(
        'id, name, from_email, from_name, smtp_host, smtp_port, smtp_username, smtp_secure, encrypted_password'
      )
      .eq('id', campaign.sender_connection_id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (senderError) {
      console.error(
        '[email-campaigns/test] sender lookup failed:',
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

    let password: string;
    try {
      password = decryptSenderPassword(
        (sender as EmailSenderRow).encrypted_password
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown decryption error';
      console.error(
        '[email-campaigns/test] credential decrypt failed:',
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

    const senderRow = sender as EmailSenderRow;
    const rendered = renderEmailCampaign(
      validation.input.subject,
      validation.input.preheader,
      validation.input.content,
      undefined,
      validation.input.design
    );
    try {
      await sendEmailThroughSender(senderRow, password, {
        to,
        subject: `[TESTE] ${validation.input.subject}`,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'SMTP_ERROR';
      console.error('[email-campaigns/test] SMTP send failed:', code);
      return NextResponse.json(
        {
          error:
            'O envio de teste falhou. Confira a conexão SMTP do remetente.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
