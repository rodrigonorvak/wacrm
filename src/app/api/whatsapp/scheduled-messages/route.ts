import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { resolveScheduledTemplate } from '@/lib/whatsapp/scheduled-template';
import type { MessageTemplate } from '@/types';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const contactId = new URL(request.url).searchParams.get('contact_id');
    if (!contactId) return NextResponse.json({ error: 'Informe o contato.' }, { status: 400 });
    const { data, error } = await supabase.from('scheduled_whatsapp_messages')
      .select('id, contact_id, label, scheduled_at, status, error_code, whatsapp_message_id')
      .eq('account_id', accountId).eq('contact_id', contactId)
      .order('scheduled_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ schedules: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    let body: Record<string, unknown>;
    try {
      const input: unknown = await request.json();
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid');
      body = input as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }
    const { contact_id: contactId, template_id: templateId, label, scheduled_at: scheduledAt, variables } = body;
    if (typeof contactId !== 'string' || typeof templateId !== 'string' ||
        typeof label !== 'string' || !label.trim() || label.trim().length > 120 ||
        typeof scheduledAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/.test(scheduledAt)) {
      return NextResponse.json({ error: 'Informe contato, modelo, nome e data válidos.' }, { status: 400 });
    }
    const date = new Date(scheduledAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || date.toISOString() !== scheduledAt) {
      return NextResponse.json({ error: 'Escolha uma data e horário futuros válidos.' }, { status: 400 });
    }
    const [contact, template] = await Promise.all([
      supabase.from('contacts').select('id, name, phone').eq('id', contactId).eq('account_id', accountId).maybeSingle(),
      supabase.from('message_templates').select('*').eq('id', templateId).eq('account_id', accountId).maybeSingle(),
    ]);
    if (contact.error || template.error) throw contact.error ?? template.error;
    if (!contact.data?.phone || !template.data?.meta_template_id) {
      return NextResponse.json({ error: 'Contato com telefone ou modelo da Meta não encontrado.' }, { status: 400 });
    }
    try {
      resolveScheduledTemplate(template.data as MessageTemplate, variables, contact.data.name);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Modelo inválido.' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin().from('scheduled_whatsapp_messages').insert({
      account_id: accountId, contact_id: contactId, template_id: templateId,
      created_by: userId, label: label.trim(), scheduled_at: date.toISOString(), variables,
    }).select('id').single();
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Já existe uma mensagem programada para este contato nesse horário.' }, { status: 409 });
    }
    if (error) throw error;
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
