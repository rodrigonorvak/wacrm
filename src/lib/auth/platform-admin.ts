import { ForbiddenError, UnauthorizedError } from './account'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export type PlatformAdminRole = 'super_admin' | 'support' | 'billing'

export interface PlatformAdminContext {
  supabase: SupabaseClient
  userId: string
  role: PlatformAdminRole
}

export interface PlatformAdminSupportSession {
  id: string
  accountId: string
  accountName: string
  expiresAt: string
}

export async function getPlatformAdminSupportSession(
  userId: string,
): Promise<PlatformAdminSupportSession | null> {
  const admin = supabaseAdmin()
  const { data: platformAdmin, error: platformAdminError } = await admin
    .from('platform_admins')
    .select('role, active')
    .eq('user_id', userId)
    .maybeSingle()
  if (platformAdminError) {
    console.error('[platform-admin] support administrator lookup failed:', platformAdminError.message)
    throw new ForbiddenError('Could not validate platform administrator access')
  }
  if (!platformAdmin || platformAdmin.active !== true || platformAdmin.role !== 'super_admin') {
    return null
  }

  const { data: session, error: sessionError } = await admin
    .from('platform_admin_account_sessions')
    .select('id, account_id, expires_at')
    .eq('admin_user_id', userId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (sessionError) {
    console.error('[platform-admin] support session lookup failed:', sessionError.message)
    throw new ForbiddenError('Could not load platform administrator account session')
  }
  if (!session) return null

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('id, name, deleted_at')
    .eq('id', session.account_id)
    .maybeSingle()

  if (accountError) {
    console.error('[platform-admin] support account lookup failed:', accountError.message)
    throw new ForbiddenError('Could not load platform administrator account')
  }
  if (!account || account.deleted_at) return null

  return {
    id: session.id,
    accountId: account.id,
    accountName: account.name,
    expiresAt: session.expires_at,
  }
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) throw new UnauthorizedError()

  const { data, error } = await supabase
    .from('platform_admins')
    .select('role, active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[platform-admin] lookup failed:', error.message)
    throw new ForbiddenError('Could not load platform administrator access')
  }
  if (!data || data.active !== true) {
    throw new ForbiddenError('Platform administrator access required')
  }

  if (!['super_admin', 'support', 'billing'].includes(data.role)) {
    throw new ForbiddenError('Unknown platform administrator role')
  }

  return {
    supabase,
    userId: user.id,
    role: data.role as PlatformAdminRole,
  }
}
