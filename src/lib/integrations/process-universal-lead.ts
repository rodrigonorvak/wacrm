import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { isValidE164, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';
import {
  readWebhookPath,
  stringifyWebhookValue,
} from '@/lib/integrations/universal-webhook';

type UniversalMapping = {
  source_field_id: string;
  target_type: string;
  target_key: string;
  is_required: boolean;
};

type UniversalIntegration = {
  id: string;
  account_id: string;
  pipeline_id: string;
  source_label: string | null;
};

type ExistingContact = {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  company: string | null;
};

function readMappedValue(payload: unknown, path: string): string | null {
  return stringifyWebhookValue(readWebhookPath(payload, path));
}

async function findContact(
  db: SupabaseClient,
  accountId: string,
  phone: string | null,
  email: string | null
): Promise<ExistingContact | null> {
  if (phone) {
    const { data, error } = await db
      .from('contacts')
      .select('id, phone, name, email, company')
      .eq('account_id', accountId)
      .eq('phone_normalized', phone)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error('Failed to find contact by phone');
    if (data) return data as ExistingContact;
  }

  if (email) {
    const { data, error } = await db
      .from('contacts')
      .select('id, phone, name, email, company')
      .eq('account_id', accountId)
      .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
      .limit(1)
      .maybeSingle();
    if (error) throw new Error('Failed to find contact by email');
    if (data) return data as ExistingContact;
  }

  return null;
}

export async function processUniversalLeadEvent(
  db: SupabaseClient,
  integration: UniversalIntegration,
  eventId: string,
  payload: unknown
): Promise<'processed' | 'awaiting_mapping' | 'failed'> {
  const { data: existingEvent, error: eventLookupError } = await db
    .from('lead_integration_events')
    .select('deal_id')
    .eq('id', eventId)
    .maybeSingle();
  if (eventLookupError) throw new Error('Failed to load webhook event');
  if (existingEvent?.deal_id) return 'processed';

  const { data: mappings, error: mappingsError } = await db
    .from('lead_integration_mappings')
    .select('source_field_id, target_type, target_key, is_required')
    .eq('integration_id', integration.id);
  if (mappingsError) throw new Error('Failed to load webhook mappings');
  const mappingRows = (mappings ?? []) as unknown as UniversalMapping[];
  if (!mappingRows.length) return 'awaiting_mapping';

  const values = mappingRows.map((mapping) => ({
    ...mapping,
    value: readMappedValue(payload, mapping.source_field_id),
  }));
  const missing = values
    .filter((mapping) => mapping.is_required && !mapping.value)
    .map((mapping) => mapping.source_field_id);
  if (missing.length) {
    await db
      .from('lead_integration_events')
      .update({
        status: 'failed',
        error_message: `Campos obrigatórios ausentes: ${missing.join(', ')}`,
      })
      .eq('id', eventId);
    return 'failed';
  }

  const valueFor = (targetType: string, targetKey: string) =>
    values.find(
      (mapping) =>
        mapping.target_type === targetType && mapping.target_key === targetKey
    )?.value ?? null;
  const rawPhone = valueFor('contact', 'phone');
  const rawEmail = valueFor('contact', 'email')?.trim().toLowerCase() ?? null;
  const email =
    rawEmail &&
    rawEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
      ? rawEmail
      : null;
  const sanitizedPhone = rawPhone ? sanitizePhoneForMeta(rawPhone) : '';
  const phone =
    sanitizedPhone && isValidE164(sanitizedPhone) ? sanitizedPhone : null;

  if (!phone && !email) {
    await db
      .from('lead_integration_events')
      .update({
        status: 'failed',
        error_message:
          'Não foi possível identificar o contato: mapeie um telefone ou e-mail.',
      })
      .eq('id', eventId);
    return 'failed';
  }

  const auditUserId = await resolveAuditUserId(db, integration.account_id);
  let existingContact = await findContact(
    db,
    integration.account_id,
    phone,
    email
  );
  if (!existingContact) {
    const { data: contact, error: contactError } = await db
      .from('contacts')
      .insert({
        account_id: integration.account_id,
        user_id: auditUserId,
        phone,
        name: valueFor('contact', 'name') ?? email ?? phone,
        email,
        company: valueFor('contact', 'company'),
      })
      .select('id')
      .single();
    if (contactError || !contact) {
      if (contactError?.code === '23505') {
        existingContact = await findContact(
          db,
          integration.account_id,
          phone,
          email
        );
      }
      if (!existingContact) throw new Error('Failed to create webhook contact');
    } else {
      existingContact = {
        id: contact.id as string,
        phone,
        name: valueFor('contact', 'name'),
        email,
        company: valueFor('contact', 'company'),
      };
    }
  }
  const contactId = existingContact.id;
  const contactUpdates = {
    ...(existingContact.phone ? {} : phone ? { phone } : {}),
    ...(existingContact.name
      ? {}
      : valueFor('contact', 'name')
        ? { name: valueFor('contact', 'name') }
        : {}),
    ...(existingContact.email ? {} : email ? { email } : {}),
    ...(existingContact.company
      ? {}
      : valueFor('contact', 'company')
        ? { company: valueFor('contact', 'company') }
        : {}),
  };
  if (Object.keys(contactUpdates).length) {
    const { error: contactUpdateError } = await db
      .from('contacts')
      .update(contactUpdates)
      .eq('id', contactId);
    if (contactUpdateError) throw new Error('Failed to update webhook contact');
  }

  for (const mapping of values) {
    if (mapping.target_type !== 'contact_custom_field' || !mapping.value) {
      continue;
    }
    const { data: existingField, error: fieldLookupError } = await db
      .from('custom_fields')
      .select('id')
      .eq('account_id', integration.account_id)
      .eq('field_name', mapping.target_key)
      .maybeSingle();
    if (fieldLookupError) throw new Error('Failed to find custom field');
    let customFieldId = existingField?.id as string | undefined;
    if (!customFieldId) {
      const { data: createdField, error: fieldError } = await db
        .from('custom_fields')
        .insert({
          account_id: integration.account_id,
          user_id: auditUserId,
          field_name: mapping.target_key,
          field_type: 'text',
        })
        .select('id')
        .single();
      if (fieldError || !createdField) {
        throw new Error('Failed to create custom field');
      }
      customFieldId = createdField.id as string;
    }
    const { error: valueError } = await db
      .from('contact_custom_values')
      .upsert(
        {
          contact_id: contactId,
          custom_field_id: customFieldId,
          value: mapping.value,
        },
        { onConflict: 'contact_id,custom_field_id' }
      );
    if (valueError) throw new Error('Failed to save custom field value');
  }

  const { data: stage, error: stageError } = await db
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', integration.pipeline_id)
    .order('position')
    .limit(1)
    .single();
  if (stageError || !stage)
    throw new Error('Integrated pipeline has no stages');

  const { data: deal, error: dealError } = await db
    .from('deals')
    .insert({
      user_id: auditUserId,
      account_id: integration.account_id,
      pipeline_id: integration.pipeline_id,
      stage_id: stage.id,
      contact_id: contactId,
      title:
        valueFor('contact', 'name') ??
        valueFor('deal', 'title') ??
        email ??
        phone ??
        'Novo lead',
      notes: valueFor('deal', 'notes'),
      source: integration.source_label,
      value: 0,
      status: 'open',
    })
    .select('id')
    .single();
  if (dealError || !deal) throw new Error('Failed to create webhook deal');

  const { error: updateError } = await db
    .from('lead_integration_events')
    .update({
      status: 'processed',
      error_message: null,
      processed_at: new Date().toISOString(),
      contact_id: contactId,
      deal_id: deal.id,
    })
    .eq('id', eventId);
  if (updateError) throw new Error('Failed to mark webhook event processed');

  await db
    .from('lead_integrations')
    .update({ last_received_at: new Date().toISOString() })
    .eq('id', integration.id);

  return 'processed';
}
