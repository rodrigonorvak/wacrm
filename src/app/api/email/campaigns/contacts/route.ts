import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const runtime = 'nodejs';

const PAGE_SIZE = 40;

export async function GET(request: Request) {
  try {
    const context = await requireEmailSenderAdmin();
    const url = new URL(request.url);
    const search = (url.searchParams.get('q') ?? '')
      .replace(/[^a-z0-9@\s._+-]/gi, ' ')
      .trim()
      .slice(0, 80);
    const pageValue = Number(url.searchParams.get('page') ?? '0');
    const page = Number.isInteger(pageValue)
      ? Math.max(0, Math.min(pageValue, 250))
      : 0;
    const from = page * PAGE_SIZE;
    let query = supabaseAdmin()
      .from('contacts')
      .select('id, name, email', { count: 'exact' })
      .eq('account_id', context.accountId)
      .not('email', 'is', null)
      .neq('email', '')
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) {
      console.error('[email-campaigns/contacts] load failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível carregar os contatos.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        contacts: data ?? [],
        total: count ?? 0,
        page,
        pageSize: PAGE_SIZE,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
