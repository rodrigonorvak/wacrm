import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { encrypt } from '@/lib/whatsapp/encryption';

const SOURCE_TYPES = ['elementor', 'meta_instant_form'] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { data, error } = await supabase
      .from('meta_integrations')
      .select(
        'id, pipeline_id, source_type, dataset_id, meta_page_id, api_version, schedule_stage_id, purchase_stage_id, is_active, last_tested_at, last_event_at, last_error, created_at, updated_at',
      )
      .eq('account_id', accountId)
      .order('source_type');

    if (error) throw error;
    return NextResponse.json({ integrations: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return bad('Invalid request body');

    const sourceType = body.source_type;
    if (!SOURCE_TYPES.includes(sourceType as SourceType)) {
      return bad('source_type must be elementor or meta_instant_form');
    }

    const pipelineId = typeof body.pipeline_id === 'string' ? body.pipeline_id : '';
    const scheduleStageId = typeof body.schedule_stage_id === 'string' ? body.schedule_stage_id : '';
    const purchaseStageId = typeof body.purchase_stage_id === 'string' ? body.purchase_stage_id : '';
    const datasetId = typeof body.dataset_id === 'string' ? body.dataset_id.trim() : '';
    const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
    const pageId = typeof body.meta_page_id === 'string' ? body.meta_page_id.trim() : '';
    const pageAccessToken = typeof body.page_access_token === 'string' ? body.page_access_token.trim() : '';
    const apiVersion = typeof body.api_version === 'string' && body.api_version.trim()
      ? body.api_version.trim()
      : 'v25.0';

    if (!pipelineId || !scheduleStageId || !purchaseStageId || !datasetId) {
      return bad('pipeline_id, stage IDs, and dataset_id are required');
    }
    if (sourceType === 'meta_instant_form' && !pageId) {
      return bad('meta_page_id is required for Meta Instant Forms');
    }

    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('id', pipelineId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (!pipeline) return bad('Pipeline not found for this account');

    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .in('id', [scheduleStageId, purchaseStageId]);
    if (!stages || stages.length !== 2) return bad('Selected stages must belong to the selected pipeline');
    if (scheduleStageId === purchaseStageId) return bad('Schedule and Purchase stages must be different');

    const { data: existing } = await supabase
      .from('meta_integrations')
      .select('id, access_token_encrypted, page_access_token_encrypted')
      .eq('account_id', accountId)
      .eq('source_type', sourceType)
      .maybeSingle();

    const encryptedToken = accessToken
      ? encrypt(accessToken)
      : existing?.access_token_encrypted;
    if (!encryptedToken) return bad('access_token is required for the first save');
    const encryptedPageToken = pageAccessToken
      ? encrypt(pageAccessToken)
      : existing?.page_access_token_encrypted;
    if (sourceType === 'meta_instant_form' && !encryptedPageToken) {
      return bad('page_access_token is required for Meta Instant Forms');
    }

    const { data, error } = await supabase
      .from('meta_integrations')
      .upsert(
        {
          account_id: accountId,
          pipeline_id: pipelineId,
          source_type: sourceType,
          dataset_id: datasetId,
          access_token_encrypted: encryptedToken,
          meta_page_id: sourceType === 'meta_instant_form' ? pageId : null,
          page_access_token_encrypted: sourceType === 'meta_instant_form' ? encryptedPageToken : null,
          api_version: apiVersion,
          schedule_stage_id: scheduleStageId,
          purchase_stage_id: purchaseStageId,
          is_active: true,
          last_error: null,
          created_by: existing ? undefined : userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,source_type' },
      )
      .select(
        'id, pipeline_id, source_type, dataset_id, meta_page_id, api_version, schedule_stage_id, purchase_stage_id, is_active, last_tested_at, last_event_at, last_error, created_at, updated_at',
      )
      .single();

    if (error || !data) throw error ?? new Error('Failed to save Meta integration');
    return NextResponse.json({ integration: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
