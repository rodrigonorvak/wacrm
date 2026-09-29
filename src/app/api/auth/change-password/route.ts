import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const MIN_PASSWORD_LENGTH = 12

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.app_metadata?.must_change_password !== true) {
    return NextResponse.json({ error: 'Password change is not required' }, { status: 409 })
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    return NextResponse.json(
      { error: `Password must be between ${MIN_PASSWORD_LENGTH} and 128 characters` },
      { status: 400 },
    )
  }

  const { error } = await supabaseAdmin().auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...user.app_metadata, must_change_password: false },
  })
  if (error) {
    console.error('[change-password] admin update failed', error.code)
    return NextResponse.json({ error: 'Could not update password' }, { status: 500 })
  }

  await supabase.auth.signOut()

  return NextResponse.json({ ok: true })
}
