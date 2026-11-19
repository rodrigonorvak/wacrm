import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Turn off the reply pulse and keep who did it in the lead history. */
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
    return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 })
  }

  const { data, error } = await account.supabase.rpc('dismiss_deal_attention', {
    p_deal_id: id,
  })
  if (error) {
    const missing = error.code === 'P0002' || /deal not found/i.test(error.message)
    const denied = error.code === '42501' || /not allowed|not authenticated/i.test(error.message)
    if (missing) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 })
    if (denied) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
    console.error('[deals] dismiss attention failed:', error.message)
    return NextResponse.json({ error: 'Não foi possível retirar o aviso.' }, { status: 500 })
  }

  return NextResponse.json({ dismissed: data === true })
}
