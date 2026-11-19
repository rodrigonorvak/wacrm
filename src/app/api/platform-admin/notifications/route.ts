import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const MAX_TITLE = 120
const MAX_BODY = 500
const MAX_RECIPIENTS = 2000

export async function POST(request: Request) {
  try {
    const platformAdmin = await requirePlatformAdmin()
    if (platformAdmin.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super administrator access required' }, { status: 403 })
    }

    const body = (await request.json().catch(() => null)) as {
      title?: unknown
      message?: unknown
      all?: unknown
      user_ids?: unknown
    } | null
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (!title || title.length > MAX_TITLE) {
      return NextResponse.json({ error: 'Informe um título de até 120 caracteres' }, { status: 400 })
    }
    if (!message || message.length > MAX_BODY) {
      return NextResponse.json({ error: 'Informe uma mensagem de até 500 caracteres' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    let query = admin
      .from('profiles')
      .select('user_id, account_id')
      .not('account_id', 'is', null)
      .limit(MAX_RECIPIENTS)

    if (body?.all !== true) {
      const userIds = Array.isArray(body?.user_ids)
        ? body.user_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : []
      if (userIds.length === 0 || userIds.length > MAX_RECIPIENTS) {
        return NextResponse.json({ error: 'Escolha pelo menos um usuário' }, { status: 400 })
      }
      query = query.in('user_id', userIds)
    }

    const { data: profiles, error } = await query
    if (error) {
      console.error('[platform-admin/notifications] recipients failed:', error.message)
      return NextResponse.json({ error: 'Não foi possível carregar os destinatários' }, { status: 500 })
    }

    const rows = (profiles ?? [])
      .filter((profile) => profile.account_id && profile.user_id)
      .map((profile) => ({
        account_id: profile.account_id as string,
        user_id: profile.user_id as string,
        type: 'platform_message',
        title,
        body: message,
        actor_user_id: platformAdmin.userId,
      }))
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Nenhum usuário com CRM para receber' }, { status: 400 })
    }

    const { error: insertError } = await admin.from('notifications').insert(rows)
    if (insertError) {
      console.error('[platform-admin/notifications] insert failed:', insertError.message)
      return NextResponse.json({ error: 'Não foi possível enviar' }, { status: 500 })
    }

    return NextResponse.json({ sent: rows.length })
  } catch (error) {
    return toErrorResponse(error)
  }
}
