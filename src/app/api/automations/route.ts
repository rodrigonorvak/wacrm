import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getPlatformAdminSupportSession } from '@/lib/auth/platform-admin'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getTemplate } from '@/lib/automations/templates'
import { insertSteps, type BuilderStepInput } from '@/lib/automations/steps-tree'
import {
  validateStepsForActivation,
  validateTriggerForActivation,
} from '@/lib/automations/validate'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let supportSession
  try {
    supportSession = await getPlatformAdminSupportSession(user.id)
  } catch (error) {
    return toErrorResponse(error)
  }
  if (supportSession) {
    const { data, error } = await supabaseAdmin()
      .from('automations')
      .select('*')
      .eq('account_id', supportSession.accountId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[automations] support-mode list failed:', error.message)
      return NextResponse.json({ error: 'Could not load automations' }, { status: 500 })
    }
    return NextResponse.json({ automations: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ automations: data ?? [] })
}

export async function POST(request: Request) {
  // Creating an automation is a write — the RLS automations_insert policy
  // requires `agent`, but this route inserts via the service-role client
  // which bypasses RLS, so the role must be enforced here.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let supportSession
  try {
    supportSession = await getPlatformAdminSupportSession(user.id)
  } catch (error) {
    return toErrorResponse(error)
  }
  if (!supportSession) {
    try {
      await requireRole('agent')
    } catch (err) {
      return toErrorResponse(err)
    }
  }

  // Resolve the caller's account_id — `automations.account_id` is NOT
  // NULL post-017, so an INSERT without it trips the not-null constraint
  // even though the admin client bypasses RLS.
  const { data: profile } = supportSession ? { data: null } : await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  const accountId = supportSession?.accountId ?? profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { name, description, trigger_type, trigger_config, is_active, steps, template } = body
  if (supportSession && is_active !== undefined && is_active !== false) {
    return NextResponse.json(
      { error: 'Automations created during support access must remain drafts until approved by the account owner.' },
      { status: 403 },
    )
  }

  let effectiveSteps: BuilderStepInput[] | undefined = steps
  let effectiveName = name
  let effectiveDescription = description
  let effectiveTriggerType = trigger_type
  let effectiveTriggerConfig = trigger_config

  if (template && (!steps || steps.length === 0)) {
    const t = getTemplate(template)
    if (t) {
      effectiveName = effectiveName ?? t.name
      effectiveDescription = effectiveDescription ?? t.description
      effectiveTriggerType = effectiveTriggerType ?? t.trigger_type
      effectiveTriggerConfig = effectiveTriggerConfig ?? t.trigger_config
      effectiveSteps = t.steps as unknown as BuilderStepInput[]
    }
  }

  if (!effectiveName || !effectiveTriggerType) {
    return NextResponse.json(
      { error: 'name and trigger_type are required' },
      { status: 400 },
    )
  }

  // Block activation of a clearly broken automation up-front instead of
  // letting every trigger silently produce a failed log row. Drafts
  // (is_active=false) are allowed to be incomplete so users can save
  // progress mid-build.
  if (is_active) {
    const issues = [
      ...validateTriggerForActivation(effectiveTriggerType, effectiveTriggerConfig ?? {}),
      ...validateStepsForActivation(
        (effectiveSteps ?? []) as unknown as { step_type: string; step_config: Record<string, unknown> }[],
      ),
    ]
    if (issues.length > 0) {
      return NextResponse.json(
        { error: 'Cannot activate automation with invalid configuration', issues },
        { status: 400 },
      )
    }
  }

  const admin = supabaseAdmin()
  const { data: automation, error: insertErr } = await admin
    .from('automations')
    .insert({
      user_id: user.id,
      account_id: accountId,
      name: effectiveName,
      description: effectiveDescription ?? null,
      trigger_type: effectiveTriggerType,
      trigger_config: effectiveTriggerConfig ?? {},
      is_active: supportSession ? false : !!is_active,
    })
    .select()
    .single()

  if (insertErr || !automation) {
    return NextResponse.json(
      { error: insertErr?.message ?? 'insert failed' },
      { status: 500 },
    )
  }

  if (effectiveSteps && effectiveSteps.length > 0) {
    const err = await insertSteps(automation.id, effectiveSteps)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
  }

  if (supportSession) {
    const { error: auditError } = await supabaseAdmin().from('platform_admin_access_audit').insert({
      session_id: supportSession.id,
      admin_user_id: user.id,
      account_id: supportSession.accountId,
      action: 'automation_created',
      table_name: 'automations',
    })
    if (auditError) {
      console.error('[automations] support-mode audit failed:', auditError.message)
      await supabaseAdmin().from('automations').delete().eq('id', automation.id).eq('account_id', accountId)
      return NextResponse.json({ error: 'Could not record support action audit' }, { status: 500 })
    }
  }

  return NextResponse.json({ automation }, { status: 201 })
}
