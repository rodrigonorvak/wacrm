import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

interface AccountRow {
  id: string
  name: string
  owner_user_id: string
  created_at: string
}

interface ProfileRow {
  user_id: string
  account_id: string
  full_name: string | null
  email: string | null
  account_role: string
  created_at: string
}

export async function GET() {
  try {
    const platformAdmin = await requirePlatformAdmin()
    if (platformAdmin.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super administrator access required' }, { status: 403 })
    }

    const admin = supabaseAdmin()
    const { data: accounts, error: accountsError } = await admin
      .from('accounts')
      .select('id, name, owner_user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (accountsError) {
      console.error('[platform-admin/accounts] account list failed:', accountsError.message)
      return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 })
    }

    const accountRows = (accounts ?? []) as AccountRow[]
    const accountIds = accountRows.map((account) => account.id)
    if (accountIds.length === 0) {
      return NextResponse.json({ accounts: [], truncated: false })
    }

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('user_id, account_id, full_name, email, account_role, created_at')
      .in('account_id', accountIds)
      .order('created_at', { ascending: true })

    if (profilesError) {
      console.error('[platform-admin/accounts] member summary failed:', profilesError.message)
      return NextResponse.json({ error: 'Failed to load account summaries' }, { status: 500 })
    }

    const membersByAccount = new Map<string, ProfileRow[]>()
    for (const profile of (profiles ?? []) as ProfileRow[]) {
      const members = membersByAccount.get(profile.account_id) ?? []
      members.push(profile)
      membersByAccount.set(profile.account_id, members)
    }

    return NextResponse.json({
      accounts: accountRows.map((account) => {
        const members = membersByAccount.get(account.id) ?? []
        const owner = members.find((member) => member.user_id === account.owner_user_id)
        return {
          id: account.id,
          name: account.name,
          created_at: account.created_at,
          member_count: members.length,
          owner: owner
            ? {
                user_id: owner.user_id,
                full_name: owner.full_name,
                email: owner.email,
              }
            : null,
        }
      }),
      truncated: accountRows.length === 100,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
