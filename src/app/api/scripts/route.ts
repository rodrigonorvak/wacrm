import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { ensureDefaultScripts } from '@/lib/scripts/ensure'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export async function GET() {
  let account
  try {
    account = await requireRole('agent')
  } catch (error) {
    return toErrorResponse(error)
  }

  try {
    await ensureDefaultScripts(supabaseAdmin(), account.accountId)
  } catch (error) {
    console.error('[scripts] ensure failed:', error)
  }

  const { data, error } = await account.supabase
    .from('conversation_scripts')
    .select('id, title, html_content, css_content, position')
    .eq('account_id', account.accountId)
    .eq('is_active', true)
    .order('position')
    .order('title')
  if (error) {
    console.error('[scripts] list failed:', error.message)
    return NextResponse.json({ error: 'Não foi possível carregar os scripts.' }, { status: 500 })
  }

  return NextResponse.json({ scripts: data ?? [] })
}
