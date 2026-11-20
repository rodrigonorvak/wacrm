import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Opening the thread in the inbox clears the reply pulse and records who opened it. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let account
  try {
    account = await requireRole('agent')
  } catch (error) {
    return toErrorResponse(error)
  }

  const { id } = await context.params
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }

  const { data, error } = await account.supabase.rpc('acknowledge_inbox_open', {
    p_conversation_id: id,
  })
  if (error) {
    const missing = error.code === 'P0002' || /conversation not found/i.test(error.message)
    const denied = error.code === '42501' || /not allowed|not authenticated/i.test(error.message)
    if (missing) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    if (denied) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
    console.error('[inbox] acknowledge open failed:', error.message)
    return NextResponse.json({ error: 'Não foi possível registrar a abertura.' }, { status: 500 })
  }

  return NextResponse.json({ cleared: typeof data === 'number' ? data : 0 })
}
