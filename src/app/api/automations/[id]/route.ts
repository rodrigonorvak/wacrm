import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { getPlatformAdminSupportSession } from '@/lib/auth/platform-admin'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  loadStepsTree,
  replaceSteps,
  type BuilderStepInput,
} from '@/lib/automations/steps-tree'
import {
  validateStepsForActivation,
  validateTriggerForActivation,
} from '@/lib/automations/validate'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let supportSession
  try {
    supportSession = await getPlatformAdminSupportSession(user.id)
  } catch (error) {
    return toErrorResponse(error)
  }
  if (supportSession) {
    const { data: automation, error } = await supabaseAdmin()
      .from('automations')
      .select('*')
      .eq('id', id)
      .eq('account_id', supportSession.accountId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'Could not load automation' }, { status: 500 })
    if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(
      { automation, steps: await loadStepsTree(id) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  let ctx: Awaited<ReturnType<typeof getCurrentAccount>>
  try {
    ctx = await getCurrentAccount()
  } catch (err) {
    return toErrorResponse(err)
  }

  const admin = supabaseAdmin()
  const { data: automation, error } = await admin
    .from('automations')
    .select('*')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .eq('user_id', ctx.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!automation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const steps = await loadStepsTree(id)
  return NextResponse.json({ automation, steps })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let supportSession
  try {
    supportSession = await getPlatformAdminSupportSession(user.id)
  } catch (error) {
    return toErrorResponse(error)
  }
  let accountId: string
  if (supportSession) {
    accountId = supportSession.accountId
  } else {
    try {
      accountId = (await requireRole('agent')).accountId
    } catch (err) {
      return toErrorResponse(err)
    }
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  if ('is_active' in body && typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // Ownership check before we touch anything. Load the fields we need
  // to compute the post-patch "effective" state for validation.
  const { data: existing } = await admin
    .from('automations')
    .select('id, user_id, account_id, is_active, trigger_type, trigger_config')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (supportSession && existing.is_active) {
    return NextResponse.json({ error: 'Active automations cannot be changed during support access.' }, { status: 403 })
  }

  const update: Record<string, unknown> = {}
  for (const k of [
    'name',
    'description',
    'trigger_type',
    'trigger_config',
    'is_active',
  ] as const) {
    if (k in body) update[k] = body[k]
  }

  // If this PATCH leaves the automation active (either explicitly
  // activating it OR editing an already-active one), validate the
  // merged configuration first. Activation is the natural gate — drafts
  // are still allowed to be incomplete.
  const willBeActive =
    typeof update.is_active === 'boolean' ? update.is_active : existing.is_active
  if (supportSession && willBeActive) {
    return NextResponse.json(
      { error: 'Automations created during support access must remain drafts until approved by the account owner.' },
      { status: 403 },
    )
  }
  if (willBeActive) {
    const mergedTriggerType = (update.trigger_type ?? existing.trigger_type) as string
    const mergedTriggerConfig = update.trigger_config ?? existing.trigger_config
    const mergedSteps = Array.isArray(body.steps)
      ? (body.steps as { step_type: string; step_config: Record<string, unknown> }[])
      : await loadStepsTree(id)
    const issues = [
      ...validateTriggerForActivation(mergedTriggerType, mergedTriggerConfig),
      ...validateStepsForActivation(mergedSteps),
    ]
    if (issues.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot keep automation active with invalid configuration',
          issues,
        },
        { status: 400 },
      )
    }
  }

  if (Object.keys(update).length > 0) {
    if (supportSession) {
      const { error: auditError } = await admin.from('platform_admin_access_audit').insert({
        session_id: supportSession.id,
        admin_user_id: user.id,
        account_id: supportSession.accountId,
        action: 'automation_updated',
        table_name: 'automations',
      })
      if (auditError) {
        console.error('[automations] support-mode audit failed:', auditError.message)
        return NextResponse.json({ error: 'Could not record support action audit' }, { status: 500 })
      }
    }
    const { error: updErr } = await admin
      .from('automations')
      .update(update)
      .eq('id', id)
      .eq('account_id', accountId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  if (Array.isArray(body.steps)) {
    if (supportSession) {
      const { error: auditError } = await admin.from('platform_admin_access_audit').insert({
        session_id: supportSession.id,
        admin_user_id: user.id,
        account_id: supportSession.accountId,
        action: 'automation_steps_updated',
        table_name: 'automation_steps',
      })
      if (auditError) {
        console.error('[automations] support-mode audit failed:', auditError.message)
        return NextResponse.json({ error: 'Could not record support action audit' }, { status: 500 })
      }
    }
    const err = await replaceSteps(id, body.steps as BuilderStepInput[])
    if (err) return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let supportSession
  try {
    supportSession = await getPlatformAdminSupportSession(user.id)
  } catch (error) {
    return toErrorResponse(error)
  }
  let accountId: string
  if (supportSession) {
    accountId = supportSession.accountId
  } else {
    try {
      accountId = (await requireRole('agent')).accountId
    } catch (err) {
      return toErrorResponse(err)
    }
  }

  const admin = supabaseAdmin()
  const { data: automation, error: lookupError } = await admin
    .from('automations')
    .select('id, is_active, user_id')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Could not load automation' }, { status: 500 })
  if (!automation || automation.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (supportSession && automation.is_active) {
    return NextResponse.json({ error: 'Active automations cannot be deleted during support access.' }, { status: 403 })
  }
  if (supportSession) {
    const { error: auditError } = await admin.from('platform_admin_access_audit').insert({
      session_id: supportSession.id,
      admin_user_id: user.id,
      account_id: supportSession.accountId,
      action: 'automation_deleted',
      table_name: 'automations',
    })
    if (auditError) {
      console.error('[automations] support-mode audit failed:', auditError.message)
      return NextResponse.json({ error: 'Could not record support action audit' }, { status: 500 })
    }
  }

  const { error } = await admin
    .from('automations')
    .delete()
    .eq('id', id)
    .eq('account_id', accountId)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
