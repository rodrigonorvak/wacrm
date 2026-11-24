import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_CONVERSATION_SCRIPTS } from './defaults'

/** Inserts the default scripts when the account still has none. */
export async function ensureDefaultScripts(
  db: SupabaseClient,
  accountId: string,
): Promise<number> {
  const { count, error } = await db
    .from('conversation_scripts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
  if (error) throw error
  if ((count ?? 0) > 0) return 0

  const rows = DEFAULT_CONVERSATION_SCRIPTS.map((script) => ({
    account_id: accountId,
    title: script.title,
    html_content: script.html_content,
    css_content: script.css_content,
    position: script.position,
    is_active: true,
  }))
  const { error: insertError } = await db.from('conversation_scripts').insert(rows)
  if (insertError) throw insertError
  return rows.length
}
