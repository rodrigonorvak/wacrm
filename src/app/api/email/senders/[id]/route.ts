import { NextResponse } from 'next/server';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { encryptSenderPassword } from '@/lib/email-senders/encryption';
import { validateEmailSenderInput } from '@/lib/email-senders/validation';
import { toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_COLUMNS =
  'id, name, provider, from_email, from_name, smtp_host, smtp_port, smtp_username, smtp_secure, created_at, updated_at';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireEmailSenderAdmin();
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'Remetente não encontrado.' },
        { status: 404 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corpo JSON inválido.' },
        { status: 400 }
      );
    }
    const result = validateEmailSenderInput(body, { passwordRequired: false });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: existing, error: lookupError } = await admin
      .from('email_sender_connections')
      .select('id, provider, smtp_host, smtp_username, encrypted_password')
      .eq('id', id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (lookupError) {
      console.error(
        '[email-senders] lookup for update failed:',
        lookupError.message
      );
      return NextResponse.json(
        { error: 'Não foi possível carregar o remetente.' },
        { status: 500 }
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: 'Remetente não encontrado.' },
        { status: 404 }
      );
    }

    let encryptedPassword = existing.encrypted_password as string;
    const credentialsChanged =
      existing.provider !== result.input.provider ||
      existing.smtp_host !== result.input.smtpHost ||
      existing.smtp_username !== result.input.smtpUsername;
    if (credentialsChanged && !result.input.password) {
      return NextResponse.json(
        {
          error:
            'Informe novamente a senha quando alterar o tipo, servidor ou usuário SMTP.',
        },
        { status: 400 }
      );
    }
    if (result.input.password) {
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
    }

    const { data, error } = await admin
      .from('email_sender_connections')
      .update({
        name: result.input.name,
        provider: result.input.provider,
        from_email: result.input.fromEmail,
        from_name: result.input.fromName,
        smtp_host: result.input.smtpHost,
        smtp_port: result.input.smtpPort,
        smtp_username: result.input.smtpUsername,
        smtp_secure: result.input.smtpSecure,
        encrypted_password: encryptedPassword,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('account_id', context.accountId)
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      console.error('[email-senders] update failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível atualizar o remetente.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ sender: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireEmailSenderAdmin();
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'Remetente não encontrado.' },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin()
      .from('email_sender_connections')
      .delete()
      .eq('id', id)
      .eq('account_id', context.accountId)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[email-senders] delete failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível excluir o remetente.' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Remetente não encontrado.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
