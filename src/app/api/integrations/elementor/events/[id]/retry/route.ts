import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts';
import { readElementorField, type JsonObject } from '@/lib/integrations/elementor';

type Mapping = { source_field_id: string; target_key: string; target_type: string; is_required: boolean };

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { supabase, accountId } = await requireRole('admin');

  const { data: event, error: eventError } = await supabase
    .from('lead_integration_events')
    .select('id, integration_id, payload, status, contact_id, deal_id')
    .eq('id', id)
    .eq('status', 'failed')
    .maybeSingle();
  if (eventError || !event) {
    return NextResponse.json({ error: 'Failed event not found' }, { status: 404 });
  }
  if (event.deal_id) {
    await supabase.from('lead_integration_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
    }).eq('id', id);
    return NextResponse.json({
      success: true,
      duplicate: true,
      contact_id: event.contact_id,
      deal_id: event.deal_id,
    });
  }

  const { data: integration } = await supabase
    .from('lead_integrations')
    .select('id, account_id, pipeline_id')
    .eq('id', event.integration_id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  const { data: mappings } = await supabase
    .from('lead_integration_mappings')
    .select('source_field_id, target_key, target_type, is_required')
    .eq('integration_id', integration.id);
  const payload = event.payload as JsonObject;
  const values = new Map(
    ((mappings ?? []) as unknown as Mapping[]).map((mapping) => [
      mapping.target_key,
      readElementorField(payload, mapping.source_field_id),
    ]),
  );
  const missing = ((mappings ?? []) as unknown as Mapping[])
    .filter((mapping) => mapping.is_required && !values.get(mapping.target_key))
    .map((mapping) => mapping.target_key);
  if (missing.length > 0 || !values.get('phone')) {
    const message = missing.length > 0 ? `Missing fields: ${missing.join(', ')}` : 'Phone is required';
    await supabase.from('lead_integration_events').update({ error_message: message }).eq('id', id);
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const auditUserId = await resolveAuditUserId(supabase, accountId);
    const { id: contactId } = await findOrCreateContact(supabase, accountId, auditUserId, {
      phone: values.get('phone')!,
      name: values.get('name'),
      email: values.get('email'),
      company: values.get('company'),
    });
    for (const mapping of (mappings ?? []) as unknown as Mapping[]) {
      if (mapping.target_type !== 'contact_custom_field') continue;
      const value = values.get(mapping.target_key);
      if (!value) continue;
      const { data: existingField } = await supabase
        .from('custom_fields')
        .select('id')
        .eq('account_id', accountId)
        .eq('field_name', mapping.target_key)
        .maybeSingle();
      let customFieldId = existingField?.id as string | undefined;
      if (!customFieldId) {
        const { data: createdField, error: fieldError } = await supabase
          .from('custom_fields')
          .insert({ account_id: accountId, user_id: auditUserId, field_name: mapping.target_key, field_type: 'text' })
          .select('id')
          .single();
        if (fieldError || !createdField) throw new Error('Failed to create custom field');
        customFieldId = createdField.id as string;
      }
      await supabase.from('contact_custom_values').upsert(
        { contact_id: contactId, custom_field_id: customFieldId, value },
        { onConflict: 'contact_id,custom_field_id' },
      );
    }
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', integration.pipeline_id)
      .order('position')
      .limit(1)
      .single();
    if (!stage) throw new Error('Integrated pipeline has no stages');

    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        user_id: auditUserId,
        account_id: accountId,
        pipeline_id: integration.pipeline_id,
        stage_id: stage.id,
        contact_id: contactId,
        title: values.get('name') || values.get('phone'),
        notes: values.get('message') || null,
        value: 0,
        status: 'open',
      })
      .select('id, stage_id')
      .single();
    if (dealError || !deal) throw new Error('Failed to create lead deal');

    await supabase.from('lead_integration_events').update({
      status: 'processed',
      error_message: null,
      processed_at: new Date().toISOString(),
      contact_id: contactId,
      deal_id: deal.id,
    }).eq('id', id);
    return NextResponse.json({ success: true, contact_id: contactId, deal_id: deal.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retry event';
    await supabase.from('lead_integration_events').update({ error_message: message }).eq('id', id);
    return NextResponse.json({ error: 'Failed to retry event' }, { status: 500 });
  }
}
