import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailCampaignDraftInput } from './types';

export async function validateEmailCampaignReferences(
  admin: SupabaseClient,
  accountId: string,
  input: EmailCampaignDraftInput
): Promise<string | null> {
  const { data: sender, error: senderError } = await admin
    .from('email_sender_connections')
    .select('id')
    .eq('id', input.senderConnectionId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (senderError) throw senderError;
  if (!sender) return 'O remetente selecionado não pertence a esta conta.';

  if (input.audienceType === 'selected_contacts') {
    const { data: contacts, error } = await admin
      .from('contacts')
      .select('id, email')
      .eq('account_id', accountId)
      .in('id', input.audienceContactIds);
    if (error) throw error;
    if (
      !contacts ||
      contacts.length !== input.audienceContactIds.length ||
      contacts.some((contact) => !contact.email?.trim())
    ) {
      return 'Um ou mais contatos selecionados não pertencem à conta ou não têm e-mail.';
    }
  }

  if (input.audienceType === 'pipeline_stage') {
    const { data: pipeline, error: pipelineError } = await admin
      .from('pipelines')
      .select('id')
      .eq('id', input.audiencePipelineId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (pipelineError) throw pipelineError;
    if (!pipeline) return 'O funil selecionado não pertence a esta conta.';

    const { data: stage, error: stageError } = await admin
      .from('pipeline_stages')
      .select('id')
      .eq('id', input.audienceStageId)
      .eq('pipeline_id', input.audiencePipelineId)
      .maybeSingle();
    if (stageError) throw stageError;
    if (!stage) return 'A etapa selecionada não pertence ao funil.';
  }

  return null;
}
