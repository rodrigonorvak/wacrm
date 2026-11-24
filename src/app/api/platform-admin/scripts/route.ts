import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { toErrorResponse } from '@/lib/auth/account'
import { ensureDefaultScripts } from '@/lib/scripts/ensure'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin()
  } catch (error) {
    return toErrorResponse(error)
  }

  const accountId = new URL(request.url).searchParams.get('account_id')
  if (!accountId) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  try {
    await ensureDefaultScripts(admin, accountId)
  } catch (error) {
    console.error('[platform-admin/scripts] ensure failed:', error)
  }

  const { data, error } = await admin
    .from('conversation_scripts')
    .select('id, account_id, title, html_content, css_content, position, is_active, updated_at')
    .eq('account_id', accountId)
    .order('position')
    .order('title')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ scripts: data ?? [] })
}

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin()
  } catch (error) {
    return toErrorResponse(error)
  }

  const body = (await request.json().catch(() => null)) as {
    account_id?: string
    title?: string
    html_content?: string
    css_content?: string
    position?: number
    is_active?: boolean
  } | null
  if (!body?.account_id || !body.title?.trim()) {
    return NextResponse.json({ error: 'account_id and title are required' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('conversation_scripts')
    .insert({
      account_id: body.account_id,
      title: body.title.trim(),
      html_content: body.html_content ?? '',
      css_content: body.css_content ?? '',
      position: Number.isFinite(body.position) ? Number(body.position) : 0,
      is_active: body.is_active !== false,
    })
    .select('id, account_id, title, html_content, css_content, position, is_active, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ script: data })
}

export async function PATCH(request: Request) {
  try {
    await requirePlatformAdmin()
  } catch (error) {
    return toErrorResponse(error)
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string
    title?: string
    html_content?: string
    css_content?: string
    position?: number
    is_active?: boolean
  } | null
  if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.title === 'string') patch.title = body.title.trim()
  if (typeof body.html_content === 'string') patch.html_content = body.html_content
  if (typeof body.css_content === 'string') patch.css_content = body.css_content
  if (typeof body.position === 'number') patch.position = body.position
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin()
    .from('conversation_scripts')
    .update(patch)
    .eq('id', body.id)
    .select('id, account_id, title, html_content, css_content, position, is_active, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ script: data })
}
