import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { automationEmailHistory, type AutomationEmailLog } from '@/lib/email-campaigns/automation-history';

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const context = await requireEmailSenderAdmin();
    const pageValue = new URL(request.url).searchParams.get('page') ?? '1';
    const page = Number(pageValue);
    if (!/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(page) || page > 100000) {
      return NextResponse.json({ error: 'Página inválida.' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const start = (page - 1) * PAGE_SIZE;
    const { data, error } = await admin
      .from('automation_logs')
      .select('id, automation_id, created_at, steps_executed')
      .eq('account_id', context.accountId)
      .contains('steps_executed', [{ step_type: 'send_email', status: 'success' }])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(start, start + PAGE_SIZE);
    if (error) {
      console.error('[email/automation-history] log lookup failed:', error.message);
      return NextResponse.json({ error: 'Não foi possível carregar os envios de automação.' }, { status: 500 });
    }

    const logs = (data ?? []).slice(0, PAGE_SIZE) as AutomationEmailLog[];
    const ids = [...new Set(logs.map((log) => log.automation_id))];
    const { data: automations, error: automationError } = ids.length
      ? await admin.from('automations').select('id, name')
          .eq('account_id', context.accountId).in('id', ids)
      : { data: [], error: null };
    if (automationError) {
      console.error('[email/automation-history] automation lookup failed:', automationError.message);
      return NextResponse.json({ error: 'Não foi possível carregar os envios de automação.' }, { status: 500 });
    }

    return NextResponse.json({
      emails: automationEmailHistory(logs, new Map((automations ?? []).map((item) => [item.id, item.name]))),
      hasMore: (data ?? []).length > PAGE_SIZE,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
