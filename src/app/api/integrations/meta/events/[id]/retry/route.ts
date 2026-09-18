import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { retryMetaEvent } from '@/lib/integrations/meta-events';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { accountId } = await requireRole('admin');
    const result = await retryMetaEvent(id, accountId);
    return NextResponse.json(result, { status: result.status === 'sent' ? 200 : 502 });
  } catch (error) {
    return toErrorResponse(error);
  }
}