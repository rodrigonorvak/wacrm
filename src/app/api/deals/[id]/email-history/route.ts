import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireRole('agent');
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }

    const { data: deal, error: dealError } = await context.supabase
      .from('deals')
      .select('contact_id')
      .eq('id', id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (dealError) {
      console.error('[deals/email-history] lead lookup failed:', dealError.message);
      return NextResponse.json(
        { error: 'Não foi possível carregar o histórico de e-mails.' },
        { status: 500 }
      );
    }
    if (!deal) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }
    if (!deal.contact_id) {
      return NextResponse.json({ emails: [] });
    }

    const admin = supabaseAdmin();
    const { data: deliveries, error: deliveriesError } = await admin
      .from('email_campaign_deliveries')
      .select('id, campaign_id, sent_at')
      .eq('account_id', context.accountId)
      .eq('contact_id', deal.contact_id)
      .eq('status', 'sent')
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: true });
    if (deliveriesError) {
      console.error(
        '[deals/email-history] delivery lookup failed:',
        deliveriesError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar o histórico de e-mails.' },
        { status: 500 }
      );
    }

    const campaignIds = [...new Set((deliveries ?? []).map((delivery) => delivery.campaign_id))];
    const { data: campaigns, error: campaignsError } = campaignIds.length
      ? await admin
          .from('email_campaigns')
          .select('id, name, subject')
          .eq('account_id', context.accountId)
          .in('id', campaignIds)
      : { data: [], error: null };
    if (campaignsError) {
      console.error(
        '[deals/email-history] campaign lookup failed:',
        campaignsError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar o histórico de e-mails.' },
        { status: 500 }
      );
    }

    const campaignById = new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign]));
    const emails = (deliveries ?? []).flatMap((delivery) => {
      const campaign = campaignById.get(delivery.campaign_id);
      return campaign && delivery.sent_at
        ? [{
            id: delivery.id,
            campaign_name: campaign.name,
            subject: campaign.subject,
            sent_at: delivery.sent_at,
          }]
        : [];
    });

    return NextResponse.json(
      { emails },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
