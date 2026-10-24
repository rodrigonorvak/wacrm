import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { hashLeadIntegrationToken } from '@/lib/integrations/lead-token';
import { getUniversalWebhookEventId } from '@/lib/integrations/universal-webhook';
import { processUniversalLeadEvent } from '@/lib/integrations/process-universal-lead';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 256 * 1024;

async function readPayload(
  request: Request,
  body: Uint8Array
): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  const text = new TextDecoder().decode(body);
  if (contentType.includes('application/json')) {
    return text.trim() ? JSON.parse(text) : {};
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
  if (contentType.includes('multipart/form-data')) {
    const multipartBody = new ArrayBuffer(body.byteLength);
    new Uint8Array(multipartBody).set(body);
    const form = await new Response(multipartBody, {
      headers: { 'content-type': contentType },
    }).formData();
    return Object.fromEntries(
      Array.from(form.entries()).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : value.name,
      ])
    );
  }

  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

async function readLimitedBody(
  request: Request,
  limit: number
): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new RangeError('Webhook payload is too large');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ pipelineId: string; token: string }> }
) {
  const { pipelineId, token } = await context.params;
  if (!token || token.length < 20) {
    return NextResponse.json(
      { error: 'Invalid webhook token' },
      { status: 401 }
    );
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Webhook payload is too large' },
      { status: 413 }
    );
  }

  let body: Uint8Array;
  try {
    body = await readLimitedBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json(
      { error: 'Failed to read webhook payload' },
      { status: 400 }
    );
  }

  let payload: unknown;
  try {
    payload = await readPayload(request, body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid webhook payload' },
      { status: 400 }
    );
  }

  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Webhook payload is too large' },
      { status: 413 }
    );
  }

  const db = supabaseAdmin();
  const tokenHash = await hashLeadIntegrationToken(token);
  const { data: integration, error: integrationError } = await db
    .from('lead_integrations')
    .select('id, account_id, pipeline_id, provider, source_label, is_active')
    .eq('pipeline_id', pipelineId)
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (integrationError) {
    console.error(
      '[universal-webhook] integration lookup failed:',
      integrationError
    );
    return NextResponse.json(
      { error: 'Webhook lookup failed' },
      { status: 500 }
    );
  }
  if (
    !integration ||
    integration.provider !== 'universal' ||
    !integration.is_active
  ) {
    return NextResponse.json(
      { error: 'Webhook not found or inactive' },
      { status: 404 }
    );
  }

  const externalEventId = getUniversalWebhookEventId(payload);
  const { data: event, error: eventError } = await db
    .from('lead_integration_events')
    .insert({
      integration_id: integration.id,
      external_event_id: externalEventId,
      payload,
      status: 'received',
    })
    .select('id')
    .single();

  if (eventError) {
    if (eventError.code === '23505') {
      return NextResponse.json({ success: true, duplicate: true });
    }
    console.error('[universal-webhook] event insert failed:', eventError);
    return NextResponse.json(
      { error: 'Failed to record webhook event' },
      { status: 500 }
    );
  }

  try {
    const result = await processUniversalLeadEvent(
      db,
      integration,
      event.id,
      payload
    );
    return NextResponse.json({
      success: true,
      accepted: true,
      status: result,
      event_id: event.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to process webhook event';
    await db
      .from('lead_integration_events')
      .update({ status: 'failed', error_message: message })
      .eq('id', event.id);
    console.error('[universal-webhook] event processing failed:', error);
    return NextResponse.json({
      success: true,
      accepted: true,
      status: 'failed',
      event_id: event.id,
    });
  }
}
