import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { getPlatformAdminSupportSession, requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SESSION_DURATION_MS = 30 * 60 * 1000

async function authorizeSuperAdmin() {
  const platformAdmin = await requirePlatformAdmin()
  if (platformAdmin.role !== 'super_admin') {
    return { response: NextResponse.json({ error: 'Super administrator access required' }, { status: 403 }) }
  }
  return { platformAdmin }
}

export async function GET() {
  try {
    const auth = await authorizeSuperAdmin()
    if ('response' in auth) return auth.response
    const session = await getPlatformAdminSupportSession(auth.platformAdmin.userId)
    return NextResponse.json({ session }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeSuperAdmin()
    if ('response' in auth) return auth.response

    const body = await request.json().catch(() => null) as { accountId?: unknown } | null
    if (!body || typeof body.accountId !== 'string' || !UUID_PATTERN.test(body.accountId)) {
      return NextResponse.json({ error: 'A valid account id is required' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: account, error: accountError } = await admin
      .from('accounts')
      .select('id')
      .eq('id', body.accountId)
      .is('deleted_at', null)
      .maybeSingle()
    if (accountError) {
      console.error('[platform-admin] support account validation failed:', accountError.message)
      return NextResponse.json({ error: 'Could not validate account access' }, { status: 500 })
    }
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const now = new Date().toISOString()
    const { data: current, error: currentError } = await admin
      .from('platform_admin_account_sessions')
      .select('id, account_id')
      .eq('admin_user_id', auth.platformAdmin.userId)
      .is('ended_at', null)
      .maybeSingle()
    if (currentError) {
      console.error('[platform-admin] current support session lookup failed:', currentError.message)
      return NextResponse.json({ error: 'Could not start account access' }, { status: 500 })
    }
    if (current) {
      const { error: endError } = await admin
        .from('platform_admin_account_sessions')
        .update({ ended_at: now })
        .eq('id', current.id)
      if (endError) {
        console.error('[platform-admin] previous support session close failed:', endError.message)
        return NextResponse.json({ error: 'Could not replace the current account access' }, { status: 500 })
      }
      const { error: auditError } = await admin.from('platform_admin_access_audit').insert({
        session_id: current.id,
        admin_user_id: auth.platformAdmin.userId,
        account_id: current.account_id,
        action: 'access_ended',
      })
      if (auditError) {
        console.error('[platform-admin] support session audit failed:', auditError.message)
        return NextResponse.json({ error: 'Could not record account access audit' }, { status: 500 })
      }
    }

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString()
    const { data: session, error: insertError } = await admin
      .from('platform_admin_account_sessions')
      .insert({
        admin_user_id: auth.platformAdmin.userId,
        account_id: account.id,
        expires_at: expiresAt,
      })
      .select('id, account_id, expires_at')
      .single()
    if (insertError || !session) {
      console.error('[platform-admin] support session creation failed:', insertError?.message)
      return NextResponse.json({ error: 'Could not start account access' }, { status: 500 })
    }

    const { error: auditError } = await admin.from('platform_admin_access_audit').insert({
      session_id: session.id,
      admin_user_id: auth.platformAdmin.userId,
      account_id: account.id,
      action: 'access_started',
    })
    if (auditError) {
      console.error('[platform-admin] support session audit failed:', auditError.message)
      await admin
        .from('platform_admin_account_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', session.id)
      return NextResponse.json({ error: 'Could not record account access audit' }, { status: 500 })
    }

    const supportSession = await getPlatformAdminSupportSession(auth.platformAdmin.userId)
    return NextResponse.json({ session: supportSession }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE() {
  try {
    const auth = await authorizeSuperAdmin()
    if ('response' in auth) return auth.response

    const admin = supabaseAdmin()
    const { data: session, error: lookupError } = await admin
      .from('platform_admin_account_sessions')
      .select('id, account_id')
      .eq('admin_user_id', auth.platformAdmin.userId)
      .is('ended_at', null)
      .maybeSingle()
    if (lookupError) {
      console.error('[platform-admin] support session lookup failed:', lookupError.message)
      return NextResponse.json({ error: 'Could not end account access' }, { status: 500 })
    }
    if (!session) return NextResponse.json({ session: null })

    const now = new Date().toISOString()
    const { error: endError } = await admin
      .from('platform_admin_account_sessions')
      .update({ ended_at: now })
      .eq('id', session.id)
    if (endError) {
      console.error('[platform-admin] support session close failed:', endError.message)
      return NextResponse.json({ error: 'Could not end account access' }, { status: 500 })
    }

    const { error: auditError } = await admin.from('platform_admin_access_audit').insert({
      session_id: session.id,
      admin_user_id: auth.platformAdmin.userId,
      account_id: session.account_id,
      action: 'access_ended',
    })
    if (auditError) {
      console.error('[platform-admin] support session audit failed:', auditError.message)
      return NextResponse.json({ error: 'Could not record account access audit' }, { status: 500 })
    }

    return NextResponse.json({ session: null })
  } catch (error) {
    return toErrorResponse(error)
  }
}
