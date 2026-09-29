import { ForbiddenError, UnauthorizedError } from './account'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type PlatformAdminRole = 'super_admin' | 'support' | 'billing'

export interface PlatformAdminContext {
  supabase: SupabaseClient
  userId: string
  role: PlatformAdminRole
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
