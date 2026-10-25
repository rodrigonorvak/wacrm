import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { buildMetaAppPatch, toPublicMetaApp, type MetaAppRow } from '@/lib/meta-apps'

async function requireSuperAdmin() {
  const ctx = await requirePlatformAdmin()
  if (ctx.role !== 'super_admin') return null
  return ctx
}

export async function GET() {
  try {
    const ctx = await requireSuperAdmin()
    if (!ctx) return NextResponse.json({ error: 'Super administrator access required' }, { status: 403 })
    const { data, error } = await supabaseAdmin()
      .from('platform_meta_apps')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[platform-admin/apps] list failed:', error.message)
      return NextResponse.json({ error: 'Failed to load apps' }, { status: 500 })
    }
    return NextResponse.json({ apps: (data as MetaAppRow[]).map(toPublicMetaApp) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireSuperAdmin()
    if (!ctx) return NextResponse.json({ error: 'Super administrator access required' }, { status: 403 })
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const patch = buildMetaAppPatch(body, false)
    if (!patch.name || !patch.app_id) {
      return NextResponse.json({ error: 'Nome e App ID são obrigatórios' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin()
      .from('platform_meta_apps')
      .insert({ ...patch, created_by: ctx.userId })
      .select('*')
      .single()
    if (error) {
      const duplicate = error.code === '23505'
      if (!duplicate) console.error('[platform-admin/apps] create failed:', error.message)
      return NextResponse.json(
        { error: duplicate ? 'Já existe um app com esse App ID' : 'Failed to create app' },
        { status: duplicate ? 409 : 500 },
      )
    }
    return NextResponse.json({ app: toPublicMetaApp(data as MetaAppRow) }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
