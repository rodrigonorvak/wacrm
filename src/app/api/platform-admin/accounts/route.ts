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
  access_status?: 'pending' | 'approved' | 'denied' | 'suspended' | 'deleted'
  created_at: string
}

function isMissingColumn(error: { message: string }, column: string): boolean {
  return error.message.toLowerCase().includes(column.toLowerCase())
}

export async function GET() {
  try {
    const platformAdmin = await requirePlatformAdmin()
    if (platformAdmin.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super administrator access required' }, { status: 403 })
    }

    const admin = supabaseAdmin()
    let accountsResult = await admin
      .from('accounts')
      .select('id, name, owner_user_id, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)

    const schemaWarnings: string[] = []
    if (accountsResult.error && isMissingColumn(accountsResult.error, 'deleted_at')) {
      schemaWarnings.push('account_lifecycle')
      console.warn('[platform-admin/accounts] accounts.deleted_at is missing; retrying without soft-delete filter')
      accountsResult = await admin
        .from('accounts')
        .select('id, name, owner_user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
    }

    if (accountsResult.error) {
      console.error('[platform-admin/accounts] account list failed:', accountsResult.error)
      return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 })
    }

    const accountRows = (accountsResult.data ?? []) as AccountRow[]
    const accountIds = accountRows.map((account) => account.id)
    if (accountIds.length === 0) {
      return NextResponse.json({ accounts: [], truncated: false, schema_warnings: schemaWarnings })
    }

    const profilesResult = await admin
      .from('profiles')
      .select('user_id, account_id, full_name, email, account_role, access_status, created_at')
      .in('account_id', accountIds)
      .order('created_at', { ascending: true })

    let profiles: ProfileRow[]
    if (profilesResult.error && isMissingColumn(profilesResult.error, 'access_status')) {
      schemaWarnings.push('account_creation_approval')
      console.warn('[platform-admin/accounts] profiles.access_status is missing; retrying without account status')
      const legacyProfilesResult = await admin
        .from('profiles')
        .select('user_id, account_id, full_name, email, account_role, created_at')
        .in('account_id', accountIds)
        .order('created_at', { ascending: true })
      if (legacyProfilesResult.error) {
        console.error('[platform-admin/accounts] member summary failed:', legacyProfilesResult.error)
        return NextResponse.json({ error: 'Failed to load account summaries' }, { status: 500 })
      }
      profiles = (legacyProfilesResult.data ?? []) as ProfileRow[]
    } else if (profilesResult.error) {
      console.error('[platform-admin/accounts] member summary failed:', profilesResult.error)
      return NextResponse.json({ error: 'Failed to load account summaries' }, { status: 500 })
    } else {
      profiles = (profilesResult.data ?? []) as ProfileRow[]
    }

    const { data: featureRows, error: featuresError } = await admin
      .from('account_feature_access')
      .select('account_id, feature_key, enabled')
      .in('account_id', accountIds)
    const featuresByAccount = new Map<string, Record<string, boolean>>()
    for (const row of featureRows ?? []) {
      const current = featuresByAccount.get(row.account_id) ?? {}
      current[row.feature_key] = row.enabled
      featuresByAccount.set(row.account_id, current)
    }

    const membersByAccount = new Map<string, ProfileRow[]>()
    for (const profile of profiles) {
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
          features: featuresByAccount.get(account.id) ?? {},
          owner: owner
            ? {
                user_id: owner.user_id,
                full_name: owner.full_name,
                email: owner.email,
              }
            : null,
          access_status: members.some((member) => member.access_status === 'suspended')
            ? 'suspended'
            : 'approved',
        }
      }),
      truncated: accountRows.length === 100,
      features_error: Boolean(featuresError),
      schema_warnings: schemaWarnings,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
