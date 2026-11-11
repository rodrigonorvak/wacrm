import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureAdLeadLabels } from './ad-lead-labels';

function database(result: { data: { id: string } | null; error: { message: string } | null }) {
  const filters: [string, string][] = [];
  const update = vi.fn();
  const query = {
    update: (value: unknown) => { update(value); return query; },
    eq: (key: string, value: string) => { filters.push([key, value]); return query; },
    select: () => query,
    maybeSingle: async () => result,
  };
  return { db: { from: () => query } as unknown as SupabaseClient, filters, update };
}

describe('record ad referral', () => {
  it('updates only the specified contact within its account', async () => {
    const { db, filters, update } = database({ data: { id: 'contact' }, error: null });
    await ensureAdLeadLabels({ db, accountId: 'account', userId: 'user', contactId: 'contact' });
    expect(filters).toEqual([['account_id', 'account'], ['id', 'contact']]);
    expect(update).toHaveBeenCalledWith({ has_ad_referral: true });
  });

  it('reports database failures and absent contacts', async () => {
    for (const result of [{ data: null, error: { message: 'database failure' } }, { data: null, error: null }]) {
      const { db } = database(result);
      await expect(ensureAdLeadLabels({ db, accountId: 'account', userId: 'user', contactId: 'contact' })).rejects.toThrow('Failed to record ad referral');
    }
  });
});
