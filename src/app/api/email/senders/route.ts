import { NextResponse } from 'next/server';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { encryptSenderPassword } from '@/lib/email-senders/encryption';
import { validateEmailSenderInput } from '@/lib/email-senders/validation';
import { toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const runtime = 'nodejs';

const PUBLIC_COLUMNS =
  'id, name, provider, from_email, from_name, smtp_host, smtp_port, smtp_username, smtp_secure, created_at, updated_at';

export async function GET() {
  try {
    const context = await requireEmailSenderAdmin();
    const { data, error } = await supabaseAdmin()
      .from('email_sender_connections')
      .select(PUBLIC_COLUMNS)
      .eq('account_id', context.accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[email-senders] load failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível carregar os remetentes de e-mail.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { senders: data ?? [] },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireEmailSenderAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corpo JSON inválido.' },
        { status: 400 }
      );
    }

    const result = validateEmailSenderInput(body, { passwordRequired: true });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    let encryptedPassword: string;
    try {
      encryptedPassword = encryptSenderPassword(result.input.password);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('ENCRYPTION_KEY')
      ) {
        return NextResponse.json(
          {
            error:
              'O servidor precisa ter a variável ENCRYPTION_KEY configurada para salvar credenciais.',
          },
          { status: 503 }
        );
      }
      throw error;
    }

    const { data, error } = await supabaseAdmin()
      .from('email_sender_connections')
      .insert({
        account_id: context.accountId,
        created_by: context.userId,
        name: result.input.name,
        provider: result.input.provider,
        from_email: result.input.fromEmail,
        from_name: result.input.fromName,
        smtp_host: result.input.smtpHost,
        smtp_port: result.input.smtpPort,
        smtp_username: result.input.smtpUsername,
        smtp_secure: result.input.smtpSecure,
        encrypted_password: encryptedPassword,
      })
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      console.error('[email-senders] create failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível salvar o remetente de e-mail.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ sender: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
