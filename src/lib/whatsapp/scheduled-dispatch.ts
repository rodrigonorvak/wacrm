import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageTemplate } from '@/types';
import { decrypt } from './encryption';
import { resolveScheduledTemplate } from './scheduled-template';
import { sendMessageToConversation } from './send-message';

interface Schedule {
  id: string;
  account_id: string;
  contact_id: string;
  template_id: string | null;
  created_by: string | null;
  variables: unknown;
}

async function setResult(
  db: SupabaseClient,
  id: string,
  status: 'failed' | 'uncertain' | 'sent',
  errorCode: string | null,
  messageId?: string,
) {
  const { data, error } = await db.from('scheduled_whatsapp_messages')
    .update({
      status, error_code: errorCode, finished_at: new Date().toISOString(),
      ...(messageId ? { whatsapp_message_id: messageId } : {}),
    })
    .eq('id', id).in('status', ['processing', 'uncertain'])
    .select('id').maybeSingle();
  if (error || !data) throw new Error(`Unable to record scheduled message result: ${error?.message ?? 'row not found'}`);
}

async function processSchedule(db: SupabaseClient, row: Schedule) {
  let sending = false;
  try {
    const [contact, templateResult, config] = await Promise.all([
      db.from('contacts').select('id, name, phone').eq('id', row.contact_id).eq('account_id', row.account_id).maybeSingle(),
      db.from('message_templates').select('*').eq('id', row.template_id).eq('account_id', row.account_id).maybeSingle(),
      db.from('whatsapp_config').select('access_token').eq('account_id', row.account_id).maybeSingle(),
    ]);
    if (contact.error || templateResult.error || config.error) throw new Error('database_lookup_failed');
    const template = templateResult.data as MessageTemplate | null;
    if (!contact.data?.phone || !template?.meta_template_id || !config.data?.access_token || !row.created_by) {
      throw new Error('missing_contact_template_or_config');
    }
    const values = resolveScheduledTemplate(template, row.variables, contact.data.name);

    // The local webhook-backed status can be stale. Fail closed if Meta
    // cannot confirm the approval immediately before dispatch.
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(template.meta_template_id)}?fields=id,status`,
      { headers: { Authorization: `Bearer ${decrypt(config.data.access_token)}` }, signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) throw new Error('meta_approval_check_failed');
    const meta: unknown = await response.json();
    if (!meta || typeof meta !== 'object' ||
        !('id' in meta) || meta.id !== template.meta_template_id ||
        !('status' in meta) || meta.status !== 'APPROVED') {
      throw new Error('template_not_approved');
    }

    let conversation = await db.from('conversations').select('id')
      .eq('account_id', row.account_id).eq('contact_id', row.contact_id).maybeSingle();
    if (conversation.error) throw new Error('conversation_lookup_failed');
    if (!conversation.data) {
      const created = await db.from('conversations').insert({
        account_id: row.account_id, contact_id: row.contact_id, user_id: row.created_by,
      }).select('id').single();
      if (created.error) {
        conversation = await db.from('conversations').select('id')
          .eq('account_id', row.account_id).eq('contact_id', row.contact_id).maybeSingle();
        if (conversation.error || !conversation.data) throw new Error('conversation_creation_failed');
      } else {
        conversation = created;
      }
    }
    if (!conversation.data) throw new Error('conversation_creation_failed');
    sending = true;
    const result = await sendMessageToConversation(db, row.account_id, {
      conversationId: conversation.data.id,
      messageType: 'template',
      automated: true,
      resolvedTemplate: template,
      templateName: template.name,
      templateLanguage: template.language,
      templateMessageParams: values,
    });
    await setResult(db, row.id, 'sent', null, result.whatsappMessageId);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unknown_error';
    console.error('[scheduled-whatsapp] dispatch failed', { scheduleId: row.id, sending, code });
    // Once the send begins even a transport or persistence error may mean
    // Meta accepted it; never automatically retry this row.
    await setResult(db, row.id, sending ? 'uncertain' : 'failed', sending ? 'send_unconfirmed' : code.slice(0, 120));
  }
}

export async function dispatchScheduledMessages(db: SupabaseClient, max = 20) {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { error: staleError } = await db.from('scheduled_whatsapp_messages')
    .update({ status: 'uncertain', error_code: 'processing_interrupted', finished_at: new Date().toISOString() })
    .eq('status', 'processing').lt('claimed_at', staleBefore);
  if (staleError) throw staleError;
  let processed = 0;
  while (processed < max) {
    const { data, error } = await db.rpc('claim_scheduled_whatsapp_message');
    if (error) throw error;
    if (!data?.length) break;
    await processSchedule(db, data[0] as Schedule);
    processed++;
  }
  return processed;
}
