import { after, NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { sendMetaEventForStage } from '@/lib/integrations/meta-events';
import { isPaidStageName } from '@/lib/pipelines/paid-stage';

export const maxDuration = 30;

const EDITABLE_FIELDS = [
  'title',
  'value',
  'contact_id',
  'stage_id',
  'assigned_to',
  'notes',
  'expected_close_date',
] as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let account;
  try {
    account = await requireRole('agent');
  } catch (error) {
    return toErrorResponse(error);
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { data: deal, error: dealError } = await account.supabase
    .from('deals')
    .select('id, account_id, pipeline_id, contact_id, stage_id, value, currency')
    .eq('id', id)
    .eq('account_id', account.accountId)
    .maybeSingle();
  if (dealError) return NextResponse.json({ error: 'Could not load deal' }, { status: 500 });
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  if (body.pipeline_id !== undefined && body.pipeline_id !== deal.pipeline_id) {
    return NextResponse.json({ error: 'Deal cannot be moved to another pipeline' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
  }
  update.currency = 'BRL';
  if (typeof update.title === 'string') update.title = update.title.trim();
  if (typeof update.value !== 'number' || !Number.isFinite(update.value)) {
    if ('value' in update) {
      return NextResponse.json({ error: 'Deal value must be a finite number' }, { status: 400 });
    }
  }
  if (typeof update.title === 'string' && !update.title) {
    return NextResponse.json({ error: 'Deal title is required' }, { status: 400 });
  }

  if ('contact_id' in update && update.contact_id !== null) {
    if (typeof update.contact_id !== 'string') {
      return NextResponse.json({ error: 'Invalid contact' }, { status: 400 });
    }
    const { data: contact, error: contactError } = await account.supabase
      .from('contacts')
      .select('id')
      .eq('id', update.contact_id)
      .eq('account_id', account.accountId)
      .maybeSingle();
    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 400 });
    }
  }

  const nextStageId = update.stage_id;
  if (nextStageId !== undefined) {
    if (typeof nextStageId !== 'string') {
      return NextResponse.json({ error: 'Invalid pipeline stage' }, { status: 400 });
    }
    const { data: stage, error: stageError } = await account.supabase
      .from('pipeline_stages')
      .select('id, name')
      .eq('id', nextStageId)
      .eq('pipeline_id', deal.pipeline_id)
      .maybeSingle();
    if (stageError || !stage) {
      return NextResponse.json({ error: 'Pipeline stage not found' }, { status: 400 });
    }
    const resultingValue = 'value' in update ? Number(update.value) : Number(deal.value ?? 0);
    if (isPaidStageName(stage.name) && !(resultingValue > 0)) {
      return NextResponse.json({ error: 'Paid amount is required for this stage' }, { status: 400 });
    }
  }

  const { data: updatedDeal, error: updateError } = await account.supabase
    .from('deals')
    .update(update)
    .eq('id', id)
    .eq('account_id', account.accountId)
    .select('id, pipeline_id, contact_id, stage_id, value, currency')
    .single();
  if (updateError || !updatedDeal) {
    return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 });
  }

  if (
    typeof nextStageId === 'string' &&
    nextStageId !== deal.stage_id &&
    updatedDeal.contact_id
  ) {
    after(() =>
      sendMetaEventForStage({
        accountId: account.accountId,
        pipelineId: updatedDeal.pipeline_id,
        dealId: updatedDeal.id,
        contactId: updatedDeal.contact_id,
        stageId: updatedDeal.stage_id,
        value: Number(updatedDeal.value ?? 0),
        currency: updatedDeal.currency,
      }).catch((error) => console.error('[deals] Meta stage event failed:', error)),
    );
  }

  return NextResponse.json({ deal: updatedDeal });
}