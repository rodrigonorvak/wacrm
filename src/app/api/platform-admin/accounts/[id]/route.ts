import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const platformAdmin = await requirePlatformAdmin()
    if (platformAdmin.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super administrator access required' }, { status: 403 })
    }

    const { id } = await params
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const admin = supabaseAdmin()
    const { data: account, error: accountError } = await admin
      .from('accounts')
      .select('id, name, owner_user_id, created_at, updated_at')
      .eq('id', id)
      .maybeSingle()
    if (accountError) {
      console.error('[platform-admin/account] lookup failed:', accountError.message)
      return NextResponse.json({ error: 'Failed to load account' }, { status: 500 })
    }
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const [membersResult, whatsappResult, metaResult, contactsResult, conversationsResult] = await Promise.all([
      admin
        .from('profiles')
        .select('user_id, full_name, email, account_role, created_at')
        .eq('account_id', id)
        .order('created_at', { ascending: true }),
      admin
        .from('whatsapp_config')
        .select('status, connected_at, registered_at, last_registration_error')
        .eq('account_id', id)
        .maybeSingle(),
      admin
        .from('meta_integrations')
        .select('source_type, is_active, last_tested_at, last_event_at, last_error')
        .eq('account_id', id)
        .order('created_at', { ascending: true }),
      admin
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', id),
      admin
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', id),
    ])

    const failedQuery = [membersResult, whatsappResult, metaResult, contactsResult, conversationsResult]
      .find((result) => result.error)
    if (failedQuery?.error) {
      console.error('[platform-admin/account] detail query failed:', failedQuery.error.message)
      return NextResponse.json({ error: 'Failed to load account details' }, { status: 500 })
    }

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        created_at: account.created_at,
        updated_at: account.updated_at,
        owner_user_id: account.owner_user_id,
      },
      members: (membersResult.data ?? []).map((member) => ({
        user_id: member.user_id,
        full_name: member.full_name,
        email: member.email,
        role: member.account_role,
        joined_at: member.created_at,
      })),
      integrations: {
        whatsapp: whatsappResult.data
          ? {
              status: whatsappResult.data.status,
              connected_at: whatsappResult.data.connected_at,
              registered: Boolean(whatsappResult.data.registered_at),
              has_error: Boolean(whatsappResult.data.last_registration_error),
            }
          : null,
        meta: (metaResult.data ?? []).map((integration) => ({
          source_type: integration.source_type,
          active: integration.is_active,
          last_tested_at: integration.last_tested_at,
          last_event_at: integration.last_event_at,
          has_error: Boolean(integration.last_error),
        })),
      },
      usage_summary: {
        contacts: contactsResult.count ?? 0,
        conversations: conversationsResult.count ?? 0,
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
