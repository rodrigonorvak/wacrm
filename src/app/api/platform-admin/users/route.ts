import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const PER_PAGE = 50

interface AuthUserSummary {
  id: string
  email?: string
  created_at: string
  last_sign_in_at?: string
  email_confirmed_at?: string
  banned_until?: string
}

interface ProfileSummary {
  user_id: string
  full_name: string | null
  account_id: string | null
  account_role: string | null
}

export async function GET(request: Request) {
  try {
    const platformAdmin = await requirePlatformAdmin()
    if (platformAdmin.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super administrator access required' }, { status: 403 })
    }

    const pageValue = Number(new URL(request.url).searchParams.get('page') ?? '1')
    if (!Number.isInteger(pageValue) || pageValue < 1 || pageValue > 100000) {
      return NextResponse.json({ error: 'page must be a positive integer' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: authResult, error: usersError } = await admin.auth.admin.listUsers({
      page: pageValue,
      perPage: PER_PAGE,
    })
    if (usersError) {
      console.error('[platform-admin/users] user list failed:', usersError.message)
      return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
    }

    const authUsers = authResult.users as AuthUserSummary[]
    const userIds = authUsers.map((user) => user.id)
    if (userIds.length === 0) {
      return NextResponse.json({ users: [], page: pageValue, perPage: PER_PAGE, hasMore: false })
    }

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('user_id, full_name, account_id, account_role')
      .in('user_id', userIds)
    if (profilesError) {
      console.error('[platform-admin/users] profile lookup failed:', profilesError.message)
      return NextResponse.json({ error: 'Failed to load user account summaries' }, { status: 500 })
    }

    const profileByUserId = new Map(
      ((profiles ?? []) as ProfileSummary[]).map((profile) => [profile.user_id, profile]),
    )
    const accountIds = [...new Set(
      ((profiles ?? []) as ProfileSummary[])
        .map((profile) => profile.account_id)
        .filter((id): id is string => Boolean(id)),
    )]

    const accountNameById = new Map<string, string>()
    if (accountIds.length > 0) {
      const { data: accounts, error: accountsError } = await admin
        .from('accounts')
        .select('id, name')
        .in('id', accountIds)
      if (accountsError) {
        console.error('[platform-admin/users] account lookup failed:', accountsError.message)
        return NextResponse.json({ error: 'Failed to load user account summaries' }, { status: 500 })
      }
      for (const account of accounts ?? []) accountNameById.set(account.id, account.name)
    }

    const now = Date.now()
    return NextResponse.json({
      users: authUsers.map((user) => {
        const profile = profileByUserId.get(user.id)
        const isSuspended = Boolean(user.banned_until && new Date(user.banned_until).getTime() > now)
        return {
          id: user.id,
          email: user.email ?? null,
          full_name: profile?.full_name ?? null,
          account_id: profile?.account_id ?? null,
          account_name: profile?.account_id ? accountNameById.get(profile.account_id) ?? null : null,
          account_role: profile?.account_role ?? null,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
          email_confirmed: Boolean(user.email_confirmed_at),
          access_status: isSuspended ? 'suspended' : 'enabled',
        }
      }),
      page: pageValue,
      perPage: PER_PAGE,
      hasMore: authUsers.length === PER_PAGE,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
