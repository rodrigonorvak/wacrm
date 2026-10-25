import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { encrypt } from '@/lib/whatsapp/encryption'
import { subscribeWabaToApp, verifyPhoneNumber } from '@/lib/whatsapp/meta-api'
import {
  exchangeSignupCode,
  getActivePlatformApp,
  requestCoexistenceSync,
} from '@/lib/whatsapp/platform-app'

/**
 * POST /api/whatsapp/embedded/complete
 * Finishes Embedded Signup: exchanges the code for a token, subscribes the
 * WABA to the platform app and stores the connection for the caller's account.
 */
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('admin')
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const code = typeof body.code === 'string' ? body.code : ''
    const wabaId = typeof body.waba_id === 'string' ? body.waba_id : ''
    const phoneNumberId = typeof body.phone_number_id === 'string' ? body.phone_number_id : ''
    const coexistence = body.coexistence === true

    if (!code || !wabaId || !phoneNumberId) {
      return NextResponse.json(
        { error: 'code, waba_id e phone_number_id são obrigatórios.' },
        { status: 400 },
      )
    }

    const app = await getActivePlatformApp()
    if (!app) {
      return NextResponse.json(
        { error: 'Nenhum app Meta ativo foi cadastrado na plataforma.' },
        { status: 400 },
      )
    }

    const admin = supabaseAdmin()
    const { data: claimed } = await admin
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', phoneNumberId)
      .neq('account_id', accountId)
      .maybeSingle()
    if (claimed) {
      return NextResponse.json(
        { error: 'Este número já está conectado a outra conta.' },
        { status: 409 },
      )
    }

    let accessToken: string
    try {
      accessToken = await exchangeSignupCode(app, code)
    } catch (err) {
      return NextResponse.json(
        { error: `Falha ao obter o token na Meta: ${err instanceof Error ? err.message : err}` },
        { status: 400 },
      )
    }

    let displayPhone: string | null = null
    try {
      const info = await verifyPhoneNumber({ phoneNumberId, accessToken })
      displayPhone = info.display_phone_number ?? null
    } catch (err) {
      console.warn('[embedded] phone verification failed:', err instanceof Error ? err.message : err)
    }

    let subscribedAppsAt: string | null = null
    try {
      await subscribeWabaToApp({ wabaId, accessToken })
      subscribedAppsAt = new Date().toISOString()
    } catch (err) {
      console.warn('[embedded] subscribed_apps failed:', err instanceof Error ? err.message : err)
    }

    const now = new Date().toISOString()
    const row = {
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      access_token: encrypt(accessToken),
      status: 'connected',
      connected_at: now,
      subscribed_apps_at: subscribedAppsAt,
      last_registration_error: null,
      connection_type: 'embedded',
      coexistence,
      platform_app_id: app.id,
      updated_at: now,
    }

    const { data: existing } = await admin
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle()

    const { error: saveError } = existing
      ? await admin.from('whatsapp_config').update(row).eq('account_id', accountId)
      : await admin
          .from('whatsapp_config')
          .insert({ account_id: accountId, user_id: userId, ...row })
    if (saveError) {
      console.error('[embedded] save failed:', saveError)
      return NextResponse.json({ error: 'Não foi possível salvar a conexão.' }, { status: 500 })
    }

    let sync: { ok: boolean; error?: string } | null = null
    if (coexistence) {
      sync = await requestCoexistenceSync(app, phoneNumberId, accessToken)
      if (sync.ok) {
        await admin.from('whatsapp_config').update({ last_sync_at: now }).eq('account_id', accountId)
      }
    }

    return NextResponse.json({
      success: true,
      phone: displayPhone,
      coexistence,
      subscribed: subscribedAppsAt != null,
      sync,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
