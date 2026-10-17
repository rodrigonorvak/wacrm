import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  createEmailUnsubscribeLink,
  getUnsubscribedAddressHashes,
  hashEmailAddress,
} from '@/lib/email-campaigns/unsubscribe';
import { renderEmailCampaign } from '@/lib/email-campaigns/render';
import {
  validateEmailCampaignDraft,
  validateEmailCampaignReadyToSend,
} from '@/lib/email-campaigns/validation';
import type { EmailBlock } from '@/lib/email-campaigns/types';
import {
  sendEmailThroughSender,
  type EmailSenderSmtpConfig,
} from '@/lib/email-senders/smtp';
import { decryptSenderPassword } from '@/lib/email-senders/encryption';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BATCH_SIZE = 2;

interface DeliveryJob {
  delivery_id: string;
  campaign_id: string;
  account_id: string;
  email_address: string;
  attempt_count: number;
}

interface CampaignRow {
  id: string;
  account_id: string;
  sender_connection_id: string;
  name: string;
  subject: string;
  preheader: string;
  audience_type: 'all_contacts' | 'selected_contacts' | 'pipeline_stage';
  audience_contact_ids: string[];
  audience_pipeline_id: string | null;
  audience_stage_id: string | null;
  content_json: unknown;
}

interface SenderRow extends EmailSenderSmtpConfig {
  id: string;
  account_id: string;
  from_name: string;
  smtp_username: string;
  smtp_port: number;
  smtp_secure: boolean;
  encrypted_password: string;
}

interface PreparedCampaign {
  campaign: CampaignRow;
  sender: SenderRow;
  password: string;
  content: EmailBlock[];
}

function getCronSecrets(): string[] {
  return [process.env.CRON_SECRET, process.env.AUTOMATION_CRON_SECRET].filter(
    (secret): secret is string => Boolean(secret)
  );
}

function isAuthorized(request: Request, secrets: string[]): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const bearerSecret = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  const supplied = [bearerSecret, request.headers.get('x-cron-secret')].filter(
    (secret): secret is string => Boolean(secret)
  );

  return supplied.some((candidate) =>
    secrets.some((expected) => {
      const candidateBuffer = Buffer.from(candidate);
      const expectedBuffer = Buffer.from(expected);
      return (
        candidateBuffer.length === expectedBuffer.length &&
        timingSafeEqual(candidateBuffer, expectedBuffer)
      );
    })
  );
}

function safeSmtpErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z0-9_-]{1,50}$/i.test(error.code)
  ) {
    return error.code;
  }
  return 'SMTP_ERROR';
}

async function recordDelivery(
  admin: ReturnType<typeof supabaseAdmin>,
  job: DeliveryJob,
  status: 'sent' | 'failed' | 'skipped',
  error?: string
): Promise<boolean> {
  const { data, error: recordError } = await admin.rpc(
    'record_email_campaign_delivery',
    {
      p_delivery_id: job.delivery_id,
      p_status: status,
      p_error: error ?? null,
    }
  );
  if (recordError || data !== true) {
    console.error(
      '[email-campaigns/dispatch] delivery result could not be recorded:',
      recordError?.message ?? 'delivery is no longer claimed'
    );
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  const secrets = getCronSecrets();
  if (secrets.length === 0) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  if (!isAuthorized(request, secrets)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: recoveredCount, error: recoverError } = await admin.rpc(
    'recover_stale_email_campaign_deliveries'
  );
  if (recoverError) {
    console.error(
      '[email-campaigns/dispatch] stale delivery recovery failed:',
      recoverError.message
    );
    return NextResponse.json(
      { error: 'Could not recover interrupted campaign deliveries.' },
      { status: 500 }
    );
  }

  const { error: finalizeError } = await admin.rpc(
    'finalize_email_campaign_deliveries'
  );
  if (finalizeError) {
    console.error(
      '[email-campaigns/dispatch] campaign finalization failed:',
      finalizeError.message
    );
    return NextResponse.json(
      { error: 'Could not finalize completed campaigns.' },
      { status: 500 }
    );
  }

  const { data: claimed, error: claimError } = await admin.rpc(
    'claim_email_campaign_delivery_batch',
    { p_batch_size: BATCH_SIZE }
  );
  if (claimError) {
    console.error(
      '[email-campaigns/dispatch] delivery claim failed:',
      claimError.message
    );
    return NextResponse.json(
      { error: 'Could not claim campaign deliveries.' },
      { status: 500 }
    );
  }

  const jobs = (claimed ?? []) as DeliveryJob[];
  if (jobs.length === 0) {
    return NextResponse.json({
      processed: 0,
      recovered: Number(recoveredCount ?? 0),
    });
  }

  const campaignIds = [...new Set(jobs.map((job) => job.campaign_id))];
  const { data: campaigns, error: campaignsError } = await admin
    .from('email_campaigns')
    .select(
      'id, account_id, sender_connection_id, name, subject, preheader, audience_type, audience_contact_ids, audience_pipeline_id, audience_stage_id, content_json'
    )
    .in('id', campaignIds);
  if (campaignsError) {
    console.error(
      '[email-campaigns/dispatch] campaign lookup failed:',
      campaignsError.message
    );
    return NextResponse.json(
      { error: 'Could not load campaigns for delivery.' },
      { status: 500 }
    );
  }

  const senderIds = [
    ...new Set(
      (campaigns ?? []).map((campaign) => campaign.sender_connection_id)
    ),
  ];
  const { data: senders, error: sendersError } = senderIds.length
    ? await admin
        .from('email_sender_connections')
        .select(
          'id, account_id, from_email, from_name, smtp_host, smtp_port, smtp_username, smtp_secure, encrypted_password'
        )
        .in('id', senderIds)
    : { data: [], error: null };
  if (sendersError) {
    console.error(
      '[email-campaigns/dispatch] sender lookup failed:',
      sendersError.message
    );
    return NextResponse.json(
      { error: 'Could not load campaign senders.' },
      { status: 500 }
    );
  }

  const senderById = new Map(
    ((senders ?? []) as SenderRow[]).map((sender) => [sender.id, sender])
  );
  const preparedByCampaignId = new Map<string, PreparedCampaign>();
  const preparationErrors = new Map<string, string>();

  for (const campaign of campaigns ?? []) {
    const sender = senderById.get(campaign.sender_connection_id);
    if (!sender || sender.account_id !== campaign.account_id) {
      preparationErrors.set(campaign.id, 'SENDER_UNAVAILABLE');
      continue;
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
      preparationErrors.set(campaign.id, 'CAMPAIGN_CONTENT_INVALID');
      continue;
    }
    const contentError = validateEmailCampaignReadyToSend(validation.input);
    if (contentError) {
      preparationErrors.set(campaign.id, 'CAMPAIGN_CONTENT_INVALID');
      continue;
    }

    try {
      preparedByCampaignId.set(campaign.id, {
        campaign,
        sender,
        password: decryptSenderPassword(sender.encrypted_password),
        content: validation.input.content,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown decryption error';
      console.error(
        '[email-campaigns/dispatch] sender credential decrypt failed:',
        message
      );
      preparationErrors.set(campaign.id, 'SENDER_CREDENTIAL_INVALID');
    }
  }

  const suppressionByAccount = new Map<string, Set<string>>();
  const failedSuppressionLookups = new Set<string>();
  for (const accountId of new Set(jobs.map((job) => job.account_id))) {
    const accountEmails = jobs
      .filter((job) => job.account_id === accountId)
      .map((job) => job.email_address);
    try {
      suppressionByAccount.set(
        accountId,
        await getUnsubscribedAddressHashes(admin, accountId, accountEmails)
      );
    } catch (error) {
      console.error(
        '[email-campaigns/dispatch] suppression lookup failed:',
        error instanceof Error ? error.message : 'Unknown lookup error'
      );
      let recorded = true;
      for (const job of jobs.filter((item) => item.account_id === accountId)) {
        failedSuppressionLookups.add(job.delivery_id);
        recorded =
          (await recordDelivery(
            admin,
            job,
            'failed',
            'UNSUBSCRIBE_LOOKUP_FAILED'
          )) && recorded;
      }
      if (!recorded) {
        return NextResponse.json(
          { error: 'Could not record failed campaign deliveries.' },
          { status: 500 }
        );
      }
      suppressionByAccount.set(accountId, new Set());
    }
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const job of jobs) {
    if (failedSuppressionLookups.has(job.delivery_id)) {
      failed += 1;
      continue;
    }

    const preparationError = preparationErrors.get(job.campaign_id);
    if (preparationError) {
      if (!(await recordDelivery(admin, job, 'failed', preparationError))) {
        return NextResponse.json(
          { error: 'Could not record failed campaign deliveries.' },
          { status: 500 }
        );
      }
      failed += 1;
      continue;
    }

    const prepared = preparedByCampaignId.get(job.campaign_id);
    if (!prepared || prepared.campaign.account_id !== job.account_id) {
      if (
        !(await recordDelivery(admin, job, 'failed', 'CAMPAIGN_UNAVAILABLE'))
      ) {
        return NextResponse.json(
          { error: 'Could not record failed campaign deliveries.' },
          { status: 500 }
        );
      }
      failed += 1;
      continue;
    }

    const addressHash = hashEmailAddress(job.account_id, job.email_address);
    if (suppressionByAccount.get(job.account_id)?.has(addressHash)) {
      if (
        !(await recordDelivery(admin, job, 'skipped', 'RECIPIENT_UNSUBSCRIBED'))
      ) {
        return NextResponse.json(
          { error: 'Could not record skipped campaign deliveries.' },
          { status: 500 }
        );
      }
      skipped += 1;
      continue;
    }

    let deliveryStatus: 'sent' | 'failed' = 'sent';
    let deliveryError: string | undefined;
    try {
      const unsubscribe = createEmailUnsubscribeLink(
        request,
        job.account_id,
        job.email_address,
        job.campaign_id
      );
      const rendered = renderEmailCampaign(
        prepared.campaign.subject,
        prepared.campaign.preheader,
        prepared.content,
        unsubscribe.url
      );
      await sendEmailThroughSender(prepared.sender, prepared.password, {
        to: job.email_address,
        subject: prepared.campaign.subject,
        text: rendered.text,
        html: rendered.html,
        headers: unsubscribe.headers,
      });
    } catch (error) {
      deliveryStatus = 'failed';
      deliveryError = safeSmtpErrorCode(error);
      console.error(
        '[email-campaigns/dispatch] message delivery failed:',
        deliveryError
      );
    }

    if (!(await recordDelivery(admin, job, deliveryStatus, deliveryError))) {
      return NextResponse.json(
        { error: 'Could not record campaign delivery result.' },
        { status: 500 }
      );
    }
    if (deliveryStatus === 'sent') sent += 1;
    else failed += 1;
  }

  const { error: releaseError } = await admin.rpc(
    'release_email_campaign_delivery_lease',
    { p_campaign_ids: campaignIds }
  );
  if (releaseError) {
    console.error(
      '[email-campaigns/dispatch] delivery lease release failed:',
      releaseError.message
    );
    return NextResponse.json(
      { error: 'Could not release campaign delivery leases.' },
      { status: 500 }
    );
  }

  const { error: finalizationError } = await admin.rpc(
    'finalize_email_campaign_deliveries'
  );
  if (finalizationError) {
    console.error(
      '[email-campaigns/dispatch] campaign finalization failed:',
      finalizationError.message
    );
    return NextResponse.json(
      { error: 'Could not finalize completed campaigns.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    processed: jobs.length,
    sent,
    skipped,
    failed,
    recovered: Number(recoveredCount ?? 0),
  });
}
