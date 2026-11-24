import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

/** Create follow-up-due notifications for today's scheduled cards. */
export async function POST(request: Request) {
  let account
  try {
    account = await requireRole('agent')
  } catch (error) {
    return toErrorResponse(error)
  }

  const body = (await request.json().catch(() => ({}))) as { sweep?: unknown }
  if (body.sweep !== true) {
    return NextResponse.json({ error: 'sweep is required' }, { status: 400 })
  }

  const { data, error } = await account.supabase.rpc(
    'dispatch_follow_up_due_notifications',
    { p_account_id: account.accountId },
  )
  if (error) {
    console.error('[follow-up] dispatch failed:', error.message)
    return NextResponse.json({ error: 'Não foi possível gerar os avisos.' }, { status: 500 })
  }

  return NextResponse.json({ notified: Number(data ?? 0) })
}
