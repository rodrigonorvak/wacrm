import { NextResponse } from 'next/server';

import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { hashLeadIntegrationToken } from '@/lib/integrations/lead-token';
import { asObject, getElementorEventId, readElementorField } from '@/lib/integrations/elementor';

type Mapping = {
  source_field_id: string;
  target_type: string;
  target_key: string;
  is_required: boolean;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ pipelineId: string; token: string }> },
) {
  const { pipelineId, token } = await context.params;
  const db = supabaseAdmin();

  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'Invalid webhook token' }, { status: 401 });
  }

  const payload = asObject(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }

  const tokenHash = await hashLeadIntegrationToken(token);
  const { data: integration, error: integrationError } = await db
    .from('lead_integrations')
    .select('id, account_id, pipeline_id, is_active')
    .eq('pipeline_id', pipelineId)
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (integrationError || !integration || !integration.is_active) {
    return NextResponse.json({ error: 'Webhook not found or inactive' }, { status: 404 });
  }

  const integrationRow = integration as unknown as {
    id: string;
    account_id: string;
    pipeline_id: string;
    is_active: boolean;
  };
  const eventId = getElementorEventId(payload);
  const { data: event, error: eventError } = await db
    .from('lead_integration_events')
    .insert({
      integration_id: integrationRow.id,
      external_event_id: eventId,
      payload,
      status: 'received',
    })
    .select('id')
    .single();

  if (eventError) {
    if (eventError.code === '23505') {
      return NextResponse.json({ success: true, duplicate: true }, { status: 200 });
    }
    console.error('[elementor-webhook] event insert failed:', eventError);
    return NextResponse.json({ error: 'Failed to record webhook event' }, { status: 500 });
  }

  const { data: mappings, error: mappingsError } = await db
    .from('lead_integration_mappings')
    .select('source_field_id, target_type, target_key, is_required')
    .eq('integration_id', integrationRow.id);
  const mappingRows = (mappings ?? []) as unknown as Mapping[];

  if (mappingsError || mappingRows.length === 0) {
    await db.from('lead_integration_events').update({ status: 'failed', error_message: 'No field mapping configured' }).eq('id', event.id);
    return NextResponse.json({ error: 'No field mapping configured' }, { status: 422 });
  }

  const values = new Map(mappingRows.map((mapping) => [mapping.target_key, readElementorField(payload, mapping.source_field_id)]));
  const missing = mappingRows
    .filter((mapping) => mapping.is_required && !values.get(mapping.target_key))
    .map((mapping) => mapping.target_key);
  if (missing.length > 0) {
    await db.from('lead_integration_events').update({ status: 'failed', error_message: `Missing fields: ${missing.join(', ')}` }).eq('id', event.id);
    return NextResponse.json({ error: 'Required fields are missing', fields: missing }, { status: 422 });
  }

  const phone = values.get('phone');
  if (!phone) {
    await db.from('lead_integration_events').update({ status: 'failed', error_message: 'Phone is required' }).eq('id', event.id);
    return NextResponse.json({ error: 'Phone is required' }, { status: 422 });
  }

  try {
    const auditUserId = await resolveAuditUserId(db, integrationRow.account_id);
    const { id: contactId } = await findOrCreateContact(db, integrationRow.account_id, auditUserId, {
      phone,
      name: values.get('name'),
      email: values.get('email'),
      company: values.get('company'),
    });

    const { data: firstStage, error: stageError } = await db
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', integrationRow.pipeline_id)
      .order('position')
      .limit(1)
      .single();
    if (stageError || !firstStage) throw new Error('Integrated pipeline has no stages');

    const notes = values.get('notes') ?? values.get('message');
    const { data: deal, error: dealError } = await db
      .from('deals')
      .insert({
        user_id: auditUserId,
        account_id: integrationRow.account_id,
        pipeline_id: integrationRow.pipeline_id,
        stage_id: firstStage.id,
        contact_id: contactId,
        title: values.get('name') || phone,
        notes: notes || null,
        value: 0,
        status: 'open',
      })
      .select('id, stage_id')
      .single();
    if (dealError || !deal) throw new Error('Failed to create lead deal');

    await db.from('lead_integration_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      contact_id: contactId,
      deal_id: deal.id,
    }).eq('id', event.id);
    await db.from('lead_integrations').update({ last_received_at: new Date().toISOString() }).eq('id', integrationRow.id);

    return NextResponse.json({ success: true, contact_id: contactId, deal_id: deal.id, stage_id: deal.stage_id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process lead';
    await db.from('lead_integration_events').update({ status: 'failed', error_message: message }).eq('id', event.id);
    console.error('[elementor-webhook] lead processing failed:', error);
    return NextResponse.json({ error: 'Failed to process lead' }, { status: 500 });
  }
}
