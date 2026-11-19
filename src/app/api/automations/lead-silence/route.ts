import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  ensureLeadSilenceAutomation,
  sweepLeadSilence,
} from '@/lib/automations/lead-silence'

/** Bind a new pipeline, or move leads that have already been silent long enough. */
export async function POST(request: Request) {
  let account
  try {
    account = await requireRole('agent')
  } catch (error) {
    return toErrorResponse(error)
  }

  const body = (await request.json().catch(() => ({}))) as {
    pipeline_id?: unknown
    sweep?: unknown
  }

  if (body.sweep === true) {
    const moved = await sweepLeadSilence(account.supabase, account.accountId)
    return NextResponse.json({ moved })
  }

  const pipelineId = typeof body.pipeline_id === 'string' ? body.pipeline_id : ''
  if (!pipelineId) {
    return NextResponse.json({ error: 'pipeline_id is required' }, { status: 400 })
  }

  const { data: pipeline } = await account.supabase
    .from('pipelines')
    .select('id')
    .eq('id', pipelineId)
    .eq('account_id', account.accountId)
    .maybeSingle()
  if (!pipeline) return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })

  await ensureLeadSilenceAutomation(supabaseAdmin(), {
    accountId: account.accountId,
    pipelineId,
  })
  return NextResponse.json({ ok: true })
}
