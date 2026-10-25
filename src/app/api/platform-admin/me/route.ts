import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

// Lets the UI decide whether to show platform-admin-only sections.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ isSuperAdmin: false }, { status: 401 })

  const { data } = await supabaseAdmin()
    .from('platform_admins')
    .select('role, active')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json(
    { isSuperAdmin: data?.active === true && data.role === 'super_admin' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
