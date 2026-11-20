import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export const LEAD_SILENCE_TRIGGER = 'lead_silence'
export const DEFAULT_SILENCE_MINUTES = 120
export const LEGACY_ATTENTION_LABEL = 'Aguardando resposta'
export const DEFAULT_ATTENTION_LABEL = 'Respondeu!'

export function attentionCaption(
  label: string | null | undefined,
  fallback = DEFAULT_ATTENTION_LABEL,
): string {
  const text = label?.trim() ?? ''
  if (!text || text === LEGACY_ATTENTION_LABEL) return fallback
  return text
}

export interface LeadSilenceConfig {
  builtin: true
  silence_minutes: number
  attention_label: string
  pipeline_id: string
  source_stage_id: string
  destination_stage_id: string
}

export function emptyLeadSilenceConfig(): LeadSilenceConfig {
  return {
    builtin: true,
    silence_minutes: DEFAULT_SILENCE_MINUTES,
    attention_label: DEFAULT_ATTENTION_LABEL,
    pipeline_id: '',
    source_stage_id: '',
    destination_stage_id: '',
  }
}

export function normalizeStageName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isNewLeadStage(name: string): boolean {
  const n = normalizeStageName(name)
  return n === 'novo lead' || n === 'novo lige' || n === 'new lead' || n === '신규 리드'
}

export function isStoppedReplyStage(name: string): boolean {
  const n = normalizeStageName(name)
  return (
    n.includes('parou de responder') ||
    n.includes('nao respondeu') ||
    n.includes('stopped repl') ||
    n.includes('no reply') ||
    n.includes('응답 중단')
  )
}

export function silenceCutoffIso(now: Date, minutes: number): string {
  const wait = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_SILENCE_MINUTES
  return new Date(now.getTime() - wait * 60_000).toISOString()
}

function asConfig(value: unknown): LeadSilenceConfig {
  const raw = (value ?? {}) as Partial<LeadSilenceConfig>
  const minutes = Number(raw.silence_minutes)
  return {
    builtin: true,
    silence_minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_SILENCE_MINUTES,
    attention_label: attentionCaption(
      typeof raw.attention_label === 'string' ? raw.attention_label : null,
    ),
    pipeline_id: typeof raw.pipeline_id === 'string' ? raw.pipeline_id : '',
    source_stage_id: typeof raw.source_stage_id === 'string' ? raw.source_stage_id : '',
    destination_stage_id:
      typeof raw.destination_stage_id === 'string' ? raw.destination_stage_id : '',
  }
}

function isAuster(name: string | null | undefined): boolean {
  return (name ?? '').toLocaleLowerCase().includes('auster')
}

type StageRow = { id: string; name: string; position: number; pipeline_id?: string }

async function stagesForPipeline(db: SupabaseClient, pipelineId: string): Promise<StageRow[]> {
  const { data } = await db
    .from('pipeline_stages')
    .select('id, name, position, pipeline_id')
    .eq('pipeline_id', pipelineId)
    .order('position')
  return (data ?? []) as StageRow[]
}

async function pairOnPipeline(
  db: SupabaseClient,
  pipelineId: string,
  createStopped: boolean,
): Promise<Pick<LeadSilenceConfig, 'pipeline_id' | 'source_stage_id' | 'destination_stage_id'> | null> {
  const stages = await stagesForPipeline(db, pipelineId)
  const source = stages.find((stage) => isNewLeadStage(stage.name))
  if (!source) return null
  let destination = stages.find((stage) => isStoppedReplyStage(stage.name))
  if (!destination && createStopped) {
    const position = stages.reduce((max, stage) => Math.max(max, stage.position), -1) + 1
    const { data: created } = await db
      .from('pipeline_stages')
      .insert({
        pipeline_id: pipelineId,
        name: 'Parou de responder',
        color: '#f97316',
        position,
        stage_type: 'other',
      })
      .select('id')
      .single()
    if (created?.id) destination = { id: created.id as string, name: 'Parou de responder', position }
  }
  if (!destination || destination.id === source.id) return null
  return {
    pipeline_id: pipelineId,
    source_stage_id: source.id,
    destination_stage_id: destination.id,
  }
}

async function findPair(
  db: SupabaseClient,
  accountId: string,
  pipelineId: string | undefined,
  createStopped: boolean,
) {
  if (pipelineId) return pairOnPipeline(db, pipelineId, createStopped)
  const { data: pipelines } = await db
    .from('pipelines')
    .select('id')
    .eq('account_id', accountId)
    .order('created_at')
  for (const pipeline of pipelines ?? []) {
    const pair = await pairOnPipeline(db, pipeline.id as string, createStopped)
    if (pair) return pair
  }
  return null
}

/**
 * Makes sure the account has the built-in silence automation.
 * Existing accounts get it inactive and unmapped. A new pipeline can
 * be bound when its columns already match. Only Auster is activated,
 * and only after the source and destination columns exist.
 */
export async function ensureLeadSilenceAutomation(
  db: SupabaseClient,
  opts: { accountId: string; pipelineId?: string },
): Promise<void> {
  const { data: account } = await db
    .from('accounts')
    .select('id, name, owner_user_id')
    .eq('id', opts.accountId)
    .maybeSingle()
  if (!account) return

  const { data: existing } = await db
    .from('automations')
    .select('id, trigger_config, is_active')
    .eq('account_id', account.id)
    .eq('trigger_type', LEAD_SILENCE_TRIGGER)
    .maybeSingle()

  const current = asConfig(existing?.trigger_config)
  const auster = isAuster(account.name as string)
  const unmapped = !current.pipeline_id || !current.source_stage_id || !current.destination_stage_id
  let next = current
  let active = Boolean(existing?.is_active)

  if (unmapped && (opts.pipelineId || auster)) {
    const pair = await findPair(db, account.id as string, opts.pipelineId, auster)
    if (pair) {
      next = { ...current, ...pair }
      if (auster) active = true
    }
  }

  if (!existing) {
    const { error } = await db.from('automations').insert({
      user_id: account.owner_user_id,
      account_id: account.id,
      name: 'Parou de responder',
      description:
        'Depois que o atendimento responde, se o lead ficar o tempo configurado sem responder, o card vai para a coluna escolhida. Se o lead responder depois, o card acende em laranja com a etiqueta temporária até o atendimento responder.',
      trigger_type: LEAD_SILENCE_TRIGGER,
      trigger_config: next,
      is_active: active,
    })
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error('[lead-silence] ensure failed:', error.message)
    }
    return
  }

  const changed =
    next.pipeline_id !== current.pipeline_id ||
    next.source_stage_id !== current.source_stage_id ||
    next.destination_stage_id !== current.destination_stage_id ||
    active !== Boolean(existing.is_active)
  if (!changed) return

  const { error } = await db
    .from('automations')
    .update({ trigger_config: next, is_active: active, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) console.error('[lead-silence] update failed:', error.message)
}

async function activeConfigs(db: SupabaseClient, accountId: string): Promise<LeadSilenceConfig[]> {
  const { data } = await db
    .from('automations')
    .select('trigger_config')
    .eq('account_id', accountId)
    .eq('trigger_type', LEAD_SILENCE_TRIGGER)
    .eq('is_active', true)
  return (data ?? [])
    .map((row) => asConfig(row.trigger_config))
    .filter((cfg) => cfg.pipeline_id && cfg.source_stage_id && cfg.destination_stage_id)
}

/** The attendant replied: restart the silence clock and clear the glow. */
export async function onAgentReplied(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  actorUserId?: string | null,
): Promise<void> {
  const { data: deals } = await db
    .from('deals')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
  const dealIds = (deals ?? []).map((deal) => deal.id as string)
  if (dealIds.length > 0) {
    await db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('type', 'lead_awaiting')
      .in('deal_id', dealIds)
      .is('read_at', null)
  }

  await db
    .from('deals')
    .update({ needs_attention: false, attention_label: null })
    .eq('account_id', accountId)
    .eq('contact_id', contactId)

  const configs = await activeConfigs(db, accountId)
  const now = new Date().toISOString()
  for (const cfg of configs) {
    const clock = await db
      .from('deals')
      .update({
        silence_started_at: now,
        ...(actorUserId ? { silence_started_by: actorUserId } : {}),
      })
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('pipeline_id', cfg.pipeline_id)
      .eq('stage_id', cfg.source_stage_id)
    if (clock.error && actorUserId && /silence_started_by/i.test(clock.error.message)) {
      await db
        .from('deals')
        .update({ silence_started_at: now })
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .eq('pipeline_id', cfg.pipeline_id)
        .eq('stage_id', cfg.source_stage_id)
    }
  }
}

/** The lead wrote again: stop the clock, and glow if they are in the stopped column. */
export async function onCustomerReplied(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<void> {
  const cleared = await db
    .from('deals')
    .update({ silence_started_at: null, silence_started_by: null })
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
  if (cleared.error && /silence_started_by/i.test(cleared.error.message)) {
    await db
      .from('deals')
      .update({ silence_started_at: null })
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
  }

  const configs = await activeConfigs(db, accountId)
  for (const cfg of configs) {
    const { data: flagged } = await db
      .from('deals')
      .update({
        needs_attention: true,
        attention_label: cfg.attention_label,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('pipeline_id', cfg.pipeline_id)
      .eq('stage_id', cfg.destination_stage_id)
      .select('id, title, pipeline_id, assigned_to')
    if (flagged?.length) {
      const deals = flagged as AwaitingDeal[]
      await notifyLeadAwaiting(db, accountId, deals, cfg.attention_label)
      const { error: eventError } = await db.from('deal_attention_dismissals').insert(
        deals.map((deal) => ({
          account_id: accountId,
          deal_id: deal.id,
          kind: 'lead_replied',
          dismissed_by: null,
        })),
      )
      if (eventError) console.error('[lead-silence] reply history failed:', eventError.message)
    }
  }
}

interface AwaitingDeal {
  id: string
  title: string
  pipeline_id: string
  assigned_to: string | null
}

async function notifyLeadAwaiting(
  db: SupabaseClient,
  accountId: string,
  deals: AwaitingDeal[],
  label: string,
): Promise<void> {
  const { data: members, error } = await db
    .from('profiles')
    .select('user_id, account_role')
    .eq('account_id', accountId)
  if (error) {
    console.error('[lead-silence] recipients failed:', error.message)
    return
  }
  const team = (members ?? []).filter((member) =>
    ['owner', 'admin', 'agent'].includes(member.account_role as string),
  )
  for (const deal of deals) {
    const assignee = team.find((member) => member.user_id === deal.assigned_to)
    const recipients = assignee ? [assignee] : team
    for (const recipient of recipients) {
      const { data: existing } = await db
        .from('notifications')
        .select('id')
        .eq('user_id', recipient.user_id)
        .eq('deal_id', deal.id)
        .eq('type', 'lead_awaiting')
        .is('read_at', null)
        .maybeSingle()
      if (existing) continue
      const { error: insertError } = await db.from('notifications').insert({
        account_id: accountId,
        user_id: recipient.user_id,
        type: 'lead_awaiting',
        deal_id: deal.id,
        pipeline_id: deal.pipeline_id,
        title: label || DEFAULT_ATTENTION_LABEL,
        body: deal.title,
      })
      if (insertError) console.error('[lead-silence] notify failed:', insertError.message)
    }
  }
}

async function renameLegacyAttentionLabel(db: SupabaseClient, accountId: string): Promise<void> {
  const { data } = await db
    .from('automations')
    .select('id, trigger_config')
    .eq('account_id', accountId)
    .eq('trigger_type', LEAD_SILENCE_TRIGGER)
  for (const row of data ?? []) {
    const config = (row.trigger_config ?? {}) as Record<string, unknown>
    if (config.attention_label !== LEGACY_ATTENTION_LABEL) continue
    const { error } = await db
      .from('automations')
      .update({
        trigger_config: { ...config, attention_label: DEFAULT_ATTENTION_LABEL },
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (error) console.error('[lead-silence] label rename failed:', error.message)
  }
}

async function attributeSilenceMoves(
  dealIds: string[],
  actors: Map<string, string | null>,
  destinationStageId: string,
): Promise<void> {
  const admin = supabaseAdmin()
  for (const dealId of dealIds) {
    const actor = actors.get(dealId)
    if (!actor) continue
    const { data: history, error } = await admin
      .from('deal_stage_history')
      .select('id')
      .eq('deal_id', dealId)
      .eq('to_stage_id', destinationStageId)
      .order('changed_at', { ascending: false })
      .limit(1)
    if (error) {
      console.error('[lead-silence] history lookup failed:', error.message)
      continue
    }
    const historyId = history?.[0]?.id as string | undefined
    if (!historyId) continue
    const { error: updateError } = await admin
      .from('deal_stage_history')
      .update({ changed_by: actor })
      .eq('id', historyId)
    if (updateError) console.error('[lead-silence] history actor failed:', updateError.message)
  }
}

export async function sweepLeadSilence(db: SupabaseClient, accountId: string): Promise<number> {
  await renameLegacyAttentionLabel(db, accountId)
  const configs = await activeConfigs(db, accountId)
  let moved = 0
  const now = new Date()
  for (const cfg of configs) {
    const { data: due, error: dueError } = await db
      .from('deals')
      .select('id, silence_started_by')
      .eq('account_id', accountId)
      .eq('pipeline_id', cfg.pipeline_id)
      .eq('stage_id', cfg.source_stage_id)
      .lte('silence_started_at', silenceCutoffIso(now, cfg.silence_minutes))
    if (dueError) {
      if (/silence_started_by/i.test(dueError.message)) {
        const { data, error } = await db
          .from('deals')
          .update({ stage_id: cfg.destination_stage_id, silence_started_at: null })
          .eq('account_id', accountId)
          .eq('pipeline_id', cfg.pipeline_id)
          .eq('stage_id', cfg.source_stage_id)
          .lte('silence_started_at', silenceCutoffIso(now, cfg.silence_minutes))
          .select('id')
        if (error) console.error('[lead-silence] sweep failed:', error.message)
        else moved += data?.length ?? 0
      } else {
        console.error('[lead-silence] sweep list failed:', dueError.message)
      }
      continue
    }
    const waiting = (due ?? []) as { id: string; silence_started_by: string | null }[]
    if (waiting.length === 0) continue
    const actors = new Map(waiting.map((deal) => [deal.id, deal.silence_started_by]))
    const { data, error } = await db
      .from('deals')
      .update({
        stage_id: cfg.destination_stage_id,
        silence_started_at: null,
        silence_started_by: null,
      })
      .in('id', waiting.map((deal) => deal.id))
      .select('id')
    if (error) {
      console.error('[lead-silence] sweep failed:', error.message)
      continue
    }
    moved += data?.length ?? 0
    await attributeSilenceMoves(
      (data ?? []).map((deal) => deal.id as string),
      actors,
      cfg.destination_stage_id,
    )
  }
  return moved
}

export async function sweepAllLeadSilence(db: SupabaseClient): Promise<number> {
  const { data, error } = await db
    .from('automations')
    .select('account_id')
    .eq('trigger_type', LEAD_SILENCE_TRIGGER)
    .eq('is_active', true)
  if (error) {
    console.error('[lead-silence] sweep list failed:', error.message)
    return 0
  }
  const accountIds = [...new Set((data ?? []).map((row) => row.account_id as string))]
  let moved = 0
  for (const accountId of accountIds) moved += await sweepLeadSilence(db, accountId)
  return moved
}
