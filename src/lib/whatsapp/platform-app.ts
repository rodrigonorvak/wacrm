import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import type { MetaAppRow } from '@/lib/meta-apps'

/** The active platform Meta app used for Embedded Signup. */
export async function getActivePlatformApp(): Promise<MetaAppRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('platform_meta_apps')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[platform-app] lookup failed:', error.message)
    return null
  }
  return (data as MetaAppRow | null) ?? null
}

async function activeApps(): Promise<MetaAppRow[]> {
  const { data } = await supabaseAdmin()
    .from('platform_meta_apps')
    .select('*')
    .eq('active', true)
  return (data as MetaAppRow[] | null) ?? []
}

/** Decrypted App Secrets of all active platform apps (webhook signatures). */
export async function loadPlatformAppSecrets(): Promise<string[]> {
  const secrets: string[] = []
  for (const app of await activeApps()) {
    if (!app.app_secret_encrypted) continue
    try {
      secrets.push(decrypt(app.app_secret_encrypted))
    } catch {
      // wrong key / malformed — ignore this app
    }
  }
  return secrets
}

/** True when the token matches the verify token of an active platform app. */
export async function matchesPlatformVerifyToken(token: string): Promise<boolean> {
  return (await activeApps()).some((a) => a.webhook_verify_token === token)
}

export function appApiBase(app: Pick<MetaAppRow, 'api_version'>): string {
  return `https://graph.facebook.com/${app.api_version || 'v21.0'}`
}

/** Exchanges the Embedded Signup `code` for a business access token. */
export async function exchangeSignupCode(
  app: MetaAppRow,
  code: string,
): Promise<string> {
  if (!app.app_secret_encrypted) {
    throw new Error('O app da plataforma não tem App Secret cadastrado.')
  }
  const params = new URLSearchParams({
    client_id: app.app_id,
    client_secret: decrypt(app.app_secret_encrypted),
    code,
  })
  const res = await fetch(`${appApiBase(app)}/oauth/access_token?${params}`)
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    error?: { message?: string }
  }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message ?? `Meta API error: ${res.status}`)
  }
  return data.access_token
}

/**
 * Coexistence: asks Meta to push contacts and history to the webhook.
 * Meta only allows this in the first 24h after onboarding; best effort.
 */
export async function requestCoexistenceSync(
  app: MetaAppRow,
  phoneNumberId: string,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  let ok = true
  let error: string | undefined
  for (const syncType of ['smb_app_state_sync', 'history']) {
    try {
      const res = await fetch(`${appApiBase(app)}/${phoneNumberId}/smb_app_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
      })
      if (!res.ok) {
        ok = false
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
        error = data.error?.message ?? `HTTP ${res.status}`
      }
    } catch (e) {
      ok = false
      error = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok, error }
}
