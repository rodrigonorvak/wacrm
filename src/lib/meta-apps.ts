import { encrypt } from '@/lib/whatsapp/encryption'
import { META_API_VERSIONS } from '@/lib/meta-api-versions'

export interface MetaAppRow {
  id: string
  name: string
  description: string | null
  app_id: string
  api_version: string
  config_id: string | null
  app_secret_encrypted: string | null
  system_token_encrypted: string | null
  redirect_uri: string | null
  instagram_app_id: string | null
  webhook_verify_token: string | null
  active: boolean
  created_at: string
  updated_at: string
}

/** Public shape: secrets are never returned, only whether they are set. */
export function toPublicMetaApp(row: MetaAppRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    app_id: row.app_id,
    api_version: row.api_version,
    config_id: row.config_id,
    redirect_uri: row.redirect_uri,
    instagram_app_id: row.instagram_app_id,
    webhook_verify_token: row.webhook_verify_token,
    active: row.active,
    has_app_secret: !!row.app_secret_encrypted,
    has_system_token: !!row.system_token_encrypted,
    created_at: row.created_at,
  }
}

function text(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

/**
 * Builds the columns to write from a request body. Secrets are only
 * included when a non-empty value is sent, so editing never wipes them.
 */
export function buildMetaAppPatch(body: Record<string, unknown>, partial: boolean) {
  const patch: Record<string, unknown> = {}
  const set = (key: string, value: unknown, present: boolean) => {
    if (present) patch[key] = value
  }
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)

  set('name', text(body.name, 120), !partial || has('name'))
  set('description', text(body.description, 500), !partial || has('description'))
  set('app_id', text(body.app_id, 64), !partial || has('app_id'))
  const version = text(body.api_version, 16)
  set(
    'api_version',
    version && (META_API_VERSIONS as readonly string[]).includes(version) ? version : 'v21.0',
    !partial || has('api_version'),
  )
  set('config_id', text(body.config_id, 64), !partial || has('config_id'))
  set('redirect_uri', text(body.redirect_uri, 500), !partial || has('redirect_uri'))
  set('instagram_app_id', text(body.instagram_app_id, 64), !partial || has('instagram_app_id'))
  set('webhook_verify_token', text(body.webhook_verify_token, 200), !partial || has('webhook_verify_token'))
  if (typeof body.active === 'boolean') patch.active = body.active

  const secret = text(body.app_secret, 500)
  if (secret) patch.app_secret_encrypted = encrypt(secret)
  const token = text(body.system_token, 2000)
  if (token) patch.system_token_encrypted = encrypt(token)

  return patch
}
