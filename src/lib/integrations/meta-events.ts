import { createHash } from 'node:crypto';

import { decrypt } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import type { MetaIntegrationSource } from '@/types';

type MetaIntegrationRow = {
  id: string;
  account_id: string;
  pipeline_id: string;
  source_type: MetaIntegrationSource;
  dataset_id: string;
  access_token_encrypted: string;
  api_version: string;
};

type ContactRow = {
  phone: string | null;
  email: string | null;
};

export type MetaEventName = 'Lead' | 'Schedule' | 'Purchase';

export interface MetaEventInput {
  accountId: string;
  pipelineId: string;
  dealId: string;
  contactId: string;
  stageId: string;
  eventName: MetaEventName;
  value?: number;
  currency?: string;
}

export type MetaStageEventInput = Omit<MetaEventInput, 'eventName'>;

export interface MetaEventPayload {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: 'website' | 'system_generated';
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashEmail(email: string | null): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized ? sha256(normalized) : undefined;
}

function hashPhone(phone: string | null): string | undefined {
  const normalized = phone?.replace(/\D/g, '');
  return normalized ? sha256(normalized) : undefined;
}

export function buildMetaEventPayload(
  integration: Pick<MetaIntegrationRow, 'source_type'>,
  input: Pick<MetaEventInput, 'dealId' | 'eventName' | 'value' | 'currency'>,
  contact: ContactRow,
  leadId?: string | null,
  eventTime = Math.floor(Date.now() / 1000),
): MetaEventPayload {
  const userData: Record<string, unknown> = {};
  const email = hashEmail(contact.email);
  const phone = hashPhone(contact.phone);
  if (email) userData.em = [email];
  if (phone) userData.ph = [phone];
  if (integration.source_type === 'meta_instant_form' && leadId) {
    userData.lead_id = leadId;
  }

  const payload: MetaEventPayload = {
    event_name: input.eventName,
    event_time: eventTime,
    event_id: `deal_${input.dealId}_${input.eventName.toLowerCase()}`,
    action_source: integration.source_type === 'elementor' ? 'website' : 'system_generated',
    user_data: userData,
  };

  if (integration.source_type === 'meta_instant_form') {
    payload.custom_data = {
      lead_event_source: 'WACRM',
      event_source: 'crm',
    };
  }

  if (input.eventName === 'Purchase') {
    payload.custom_data = {
      ...(payload.custom_data ?? {}),
      value: input.value ?? 0,
      currency: input.currency ?? 'BRL',
    };
  }

  return payload;
}

async function loadLeadId(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  contactId: string,
): Promise<string | null> {
  const { data: field } = await db
    .from('custom_fields')
    .select('id')
    .eq('account_id', accountId)
    .eq('field_name', 'meta_lead_id')
    .maybeSingle();
  if (!field?.id) return null;

  const { data: value } = await db
    .from('contact_custom_values')
    .select('value')
    .eq('contact_id', contactId)
    .eq('custom_field_id', field.id)
    .maybeSingle();
  return typeof value?.value === 'string' ? value.value : null;
}

export async function sendMetaEvent(
  input: MetaEventInput,
  integrationId?: string,
): Promise<void> {
  const db = supabaseAdmin();
  let integrationsQuery = db
    .from('meta_integrations')
    .select('id, account_id, pipeline_id, source_type, dataset_id, access_token_encrypted, api_version')
    .eq('account_id', input.accountId)
    .eq('pipeline_id', input.pipelineId)
    .eq('is_active', true);
  if (integrationId) integrationsQuery = integrationsQuery.eq('id', integrationId);

  const [{ data: integrations }, { data: contact }, leadId] = await Promise.all([
    integrationsQuery,
    db
      .from('contacts')
      .select('phone, email')
      .eq('id', input.contactId)
      .eq('account_id', input.accountId)
      .maybeSingle(),
    loadLeadId(db, input.accountId, input.contactId),
  ]);

  if (!integrations?.length || !contact) return;

  for (const integration of integrations as MetaIntegrationRow[]) {
    const payload = buildMetaEventPayload(integration, input, contact, leadId);
    const eventId = payload.event_id;

    if (integration.source_type === 'meta_instant_form' && !payload.user_data.lead_id) {
      await db.from('meta_conversion_events').upsert(
        {
          integration_id: integration.id,
          account_id: input.accountId,
          pipeline_id: input.pipelineId,
          deal_id: input.dealId,
          contact_id: input.contactId,
          stage_id: input.stageId,
          event_name: input.eventName,
          event_id: eventId,
          payload,
          status: 'failed',
          error_message: 'Meta lead_id is required for Instant Forms events',
          attempts: 0,
        },
        { onConflict: 'integration_id,event_id', ignoreDuplicates: true },
      );
      continue;
    }

    const { error: insertError } = await db.from('meta_conversion_events').insert({
      integration_id: integration.id,
      account_id: input.accountId,
      pipeline_id: input.pipelineId,
      deal_id: input.dealId,
      contact_id: input.contactId,
      stage_id: input.stageId,
      event_name: input.eventName,
      event_id: eventId,
      payload,
      status: 'pending',
      attempts: 1,
    });
    if (insertError?.code === '23505') continue;
    if (insertError) continue;

    try {
      const accessToken = decrypt(integration.access_token_encrypted);
      const response = await fetch(
        `https://graph.facebook.com/${integration.api_version}/${integration.dataset_id}/events?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ data: [payload] }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(`Meta API returned ${response.status}`);

      await db
        .from('meta_conversion_events')
        .update({ status: 'sent', meta_response: responseBody, sent_at: new Date().toISOString() })
        .eq('integration_id', integration.id)
        .eq('event_id', eventId);
      await db
        .from('meta_integrations')
        .update({ last_event_at: new Date().toISOString(), last_error: null })
        .eq('id', integration.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Meta event request failed';
      await db
        .from('meta_conversion_events')
        .update({ status: 'failed', error_message: message })
        .eq('integration_id', integration.id)
        .eq('event_id', eventId);
      await db.from('meta_integrations').update({ last_error: message }).eq('id', integration.id);
    }
  }
}

export async function sendMetaEventForStage(input: MetaStageEventInput): Promise<void> {
  const db = supabaseAdmin();
  const { data: integrations } = await db
    .from('meta_integrations')
    .select('id, schedule_stage_id, purchase_stage_id')
    .eq('account_id', input.accountId)
    .eq('pipeline_id', input.pipelineId)
    .eq('is_active', true);

  for (const integration of integrations ?? []) {
    const eventName =
      integration.schedule_stage_id === input.stageId
        ? 'Schedule'
        : integration.purchase_stage_id === input.stageId
          ? 'Purchase'
          : null;
    if (!eventName) continue;
    await sendMetaEvent({ ...input, eventName }, integration.id);
  }
}

export async function retryMetaEvent(eventId: string, accountId: string): Promise<{
  status: 'sent' | 'failed';
  response?: Record<string, unknown>;
  error?: string;
}> {
  const db = supabaseAdmin();
  const { data: event } = await db
    .from('meta_conversion_events')
    .select('id, integration_id, payload, attempts, status')
    .eq('id', eventId)
    .eq('account_id', accountId)
    .eq('status', 'failed')
    .maybeSingle();
  if (!event) throw new Error('Failed Meta event not found');

  const { data: integration } = await db
    .from('meta_integrations')
    .select('id, access_token_encrypted, dataset_id, api_version, is_active')
    .eq('id', event.integration_id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!integration || !integration.is_active) throw new Error('Meta integration is not active');

  const attempts = Number(event.attempts ?? 0) + 1;
  await db
    .from('meta_conversion_events')
    .update({ status: 'pending', attempts, error_message: null })
    .eq('id', event.id);

  try {
    const accessToken = decrypt(integration.access_token_encrypted);
    const response = await fetch(
      `https://graph.facebook.com/${integration.api_version}/${integration.dataset_id}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: [event.payload] }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Meta API returned ${response.status}`);

    await db
      .from('meta_conversion_events')
      .update({ status: 'sent', meta_response: responseBody, sent_at: new Date().toISOString() })
      .eq('id', event.id);
    await db
      .from('meta_integrations')
      .update({ last_event_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id);
    return { status: 'sent', response: responseBody };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Meta event request failed';
    await db
      .from('meta_conversion_events')
      .update({ status: 'failed', error_message: message })
      .eq('id', event.id);
    await db.from('meta_integrations').update({ last_error: message }).eq('id', integration.id);
    return { status: 'failed', error: message };
  }
}
