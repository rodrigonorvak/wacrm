import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { buildMetaAppPatch, toPublicMetaApp, type MetaAppRow } from '@/lib/meta-apps'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const ctx = await requirePlatformAdmin()
    if (ctx.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super administrator access required' }, { status: 403 })
    }
    const { id } = await params
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const patch = buildMetaAppPatch(body, true)
    if (patch.name === null || patch.app_id === null) {
      return NextResponse.json({ error: 'Nome e App ID são obrigatórios' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin()
      .from('platform_meta_apps')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) {
      const duplicate = error.code === '23505'
      if (!duplicate) console.error('[platform-admin/apps] update failed:', error.message)
      return NextResponse.json(
        { error: duplicate ? 'Já existe um app com esse App ID' : 'Failed to update app' },
        { status: duplicate ? 409 : 500 },
      )
    }
    if (!data) return NextResponse.json({ error: 'App not found' }, { status: 404 })
    return NextResponse.json({ app: toPublicMetaApp(data as MetaAppRow) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const ctx = await requirePlatformAdmin()
    if (ctx.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super administrator access required' }, { status: 403 })
    }
    const { id } = await params
    const { error } = await supabaseAdmin().from('platform_meta_apps').delete().eq('id', id)
    if (error) {
      console.error('[platform-admin/apps] delete failed:', error.message)
      return NextResponse.json({ error: 'Failed to delete app' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
