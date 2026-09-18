import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature';
import { sendMetaEvent } from '@/lib/integrations/meta-events';

export const maxDuration = 60;

type LeadField = { name?: string; values?: string[] };
type LeadData = { id: string; created_time?: string; field_data?: LeadField[] };

type LeadChange = {
  field?: string;
  value?: {
    leadgen_id?: string;
    form_id?: string;
    ad_id?: string;
    adset_id?: string;
    campaign_id?: string;
    created_time?: number;
  };
};

type MetaWebhookBody = {
  entry?: Array<{ id?: string; changes?: LeadChange[] }>;
};

function verifyTokenMatches(received: string): boolean {
  const expected = process.env.META_LEAD_WEBHOOK_VERIFY_TOKEN ?? '';
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return Boolean(expected) && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function fieldValue(fields: LeadField[], names: string[]): string | null {
  const field = fields.find((item) => {
    const name = (item.name ?? '').toLowerCase();
    return names.some((candidate) => name.includes(candidate));
  });
  const value = field?.values?.[0];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode !== 'subscribe' || !token || !challenge || !verifyTokenMatches(token)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyMetaWebhookSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid Meta signature' }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as MetaWebhookBody;
  const db = supabaseAdmin();
  let processed = 0;

  for (const entry of body.entry ?? []) {
    const pageId = entry.id;
    if (!pageId) continue;
    for (const change of entry.changes ?? []) {
      const leadId = change.value?.leadgen_id;
      if (change.field !== 'leadgen' || !leadId) continue;

      const { data: integration } = await db
        .from('meta_integrations')
        .select('id, account_id, pipeline_id, api_version, page_access_token_encrypted, is_active')
        .eq('source_type', 'meta_instant_form')
        .eq('meta_page_id', pageId)
        .eq('is_active', true)
        .maybeSingle();
      if (!integration?.page_access_token_encrypted) continue;

      const { data: duplicate } = await db
        .from('lead_integration_events')
        .select('id')
        .eq('integration_id', integration.id)
        .eq('external_event_id', leadId)
        .maybeSingle();
      if (duplicate) continue;

      const accessToken = decrypt(integration.page_access_token_encrypted);
      const leadResponse = await fetch(
        `https://graph.facebook.com/${integration.api_version}/${leadId}?fields=id,created_time,field_data&access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const lead = (await leadResponse.json()) as LeadData & { error?: { message?: string } };
      if (!leadResponse.ok || !lead.id) {
        throw new Error(lead.error?.message ?? 'Meta lead could not be loaded');
      }

      const { data: event, error: eventError } = await db
        .from('lead_integration_events')
        .insert({
          integration_id: integration.id,
          external_event_id: lead.id,
          payload: { webhook: change.value, lead },
          status: 'received',
        })
        .select('id')
        .single();
      if (eventError || !event) throw eventError ?? new Error('Failed to record Meta lead');

      const fields = lead.field_data ?? [];
      const auditUserId = await resolveAuditUserId(db, integration.account_id);
      const { id: contactId } = await findOrCreateContact(db, integration.account_id, auditUserId, {
        phone: fieldValue(fields, ['phone', 'telefone', 'whatsapp']) ?? '',
        name: fieldValue(fields, ['full_name', 'name', 'nome']),
        email: fieldValue(fields, ['email', 'e-mail']),
        company: fieldValue(fields, ['company', 'empresa']),
      });

      const { data: leadField } = await db
        .from('custom_fields')
        .select('id')
        .eq('account_id', integration.account_id)
        .eq('field_name', 'meta_lead_id')
        .maybeSingle();
      let customFieldId = leadField?.id as string | undefined;
      if (!customFieldId) {
        const { data: createdField, error: fieldError } = await db
          .from('custom_fields')
          .insert({ account_id: integration.account_id, user_id: auditUserId, field_name: 'meta_lead_id', field_type: 'text' })
          .select('id')
          .single();
        if (fieldError || !createdField) throw fieldError ?? new Error('Failed to create Meta lead field');
        customFieldId = createdField.id as string;
      }
      await db.from('contact_custom_values').upsert(
        { contact_id: contactId, custom_field_id: customFieldId, value: lead.id },
        { onConflict: 'contact_id,custom_field_id' },
      );

      const { data: firstStage, error: stageError } = await db
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', integration.pipeline_id)
        .order('position')
        .limit(1)
        .single();
      if (stageError || !firstStage) throw new Error('Integrated pipeline has no stages');

      const { data: deal, error: dealError } = await db
        .from('deals')
        .insert({
          user_id: auditUserId,
          account_id: integration.account_id,
          pipeline_id: integration.pipeline_id,
          stage_id: firstStage.id,
          contact_id: contactId,
          title: fieldValue(fields, ['full_name', 'name', 'nome']) ?? lead.id,
          value: 0,
          status: 'open',
        })
        .select('id, stage_id')
        .single();
      if (dealError || !deal) throw dealError ?? new Error('Failed to create Meta lead deal');

      await db.from('lead_integration_events').update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        contact_id: contactId,
        deal_id: deal.id,
      }).eq('id', event.id);
      await db.from('meta_integrations').update({ webhook_last_received_at: new Date().toISOString() }).eq('id', integration.id);
      await sendMetaEvent({
        accountId: integration.account_id,
        pipelineId: integration.pipeline_id,
        dealId: deal.id,
        contactId,
        stageId: deal.stage_id,
        eventName: 'Lead',
      });
      processed += 1;
    }
  }

  return NextResponse.json({ received: true, processed });
}
