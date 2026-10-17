import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  EMAIL_CAMPAIGN_DELIVERY_STATUSES,
  EMAIL_CAMPAIGN_REPORT_PAGE_SIZE,
  parseEmailCampaignReportQuery,
} from '@/lib/email-campaigns/report';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireEmailSenderAdmin();
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    }

    const query = parseEmailCampaignReportQuery(
      new URL(request.url).searchParams
    );
    if (!query) {
      return NextResponse.json(
        { error: 'Parâmetros do relatório inválidos.' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const { data: campaign, error: campaignError } = await admin
      .from('email_campaigns')
      .select('id, name, subject, status, scheduled_at')
      .eq('id', id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (campaignError) {
      console.error(
        '[email-campaigns/report] campaign lookup failed:',
        campaignError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar o relatório da campanha.' },
        { status: 500 }
      );
    }
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    }

    const countResults = await Promise.all(
      EMAIL_CAMPAIGN_DELIVERY_STATUSES.map(async (status) => {
        const { count, error } = await admin
          .from('email_campaign_deliveries')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', id)
          .eq('account_id', context.accountId)
          .eq('status', status);
        return { status, count, error };
      })
    );
    const countError = countResults.find((result) => result.error)?.error;
    if (countError) {
      console.error(
        '[email-campaigns/report] delivery counts lookup failed:',
        countError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar as métricas da campanha.' },
        { status: 500 }
      );
    }

    const counts = Object.fromEntries(
      countResults.map(({ status, count }) => [status, count ?? 0])
    );

    let deliveriesQuery = admin
      .from('email_campaign_deliveries')
      .select(
        'id, email_address, status, attempt_count, sent_at, last_error, created_at',
        { count: 'exact' }
      )
      .eq('campaign_id', id)
      .eq('account_id', context.accountId);
    if (query.status !== 'all') {
      deliveriesQuery = deliveriesQuery.eq('status', query.status);
    }

    const from = (query.page - 1) * EMAIL_CAMPAIGN_REPORT_PAGE_SIZE;
    const {
      data: deliveries,
      count,
      error: deliveriesError,
    } = await deliveriesQuery
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + EMAIL_CAMPAIGN_REPORT_PAGE_SIZE - 1);
    if (deliveriesError) {
      console.error(
        '[email-campaigns/report] delivery rows lookup failed:',
        deliveriesError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar os destinatários da campanha.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        campaign,
        counts,
        deliveries: deliveries ?? [],
        total: count ?? 0,
        page: query.page,
        pageSize: EMAIL_CAMPAIGN_REPORT_PAGE_SIZE,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
