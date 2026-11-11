import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Persist a confirmed ad referral on the contact, so every conversation and
 * future pipeline card for that contact can display its origin.
 */
export async function ensureAdLeadLabels(input: {
  db: SupabaseClient;
  accountId: string;
  userId: string;
  contactId: string;
  dealId?: string;
}): Promise<void> {
  const { data, error } = await input.db.from('contacts')
    .update({ has_ad_referral: true })
    .eq('account_id', input.accountId)
    .eq('id', input.contactId)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Failed to record ad referral: ${error?.message ?? 'contact not found'}`);
  }
}
