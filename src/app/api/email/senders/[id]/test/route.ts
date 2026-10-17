import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';
import { decryptSenderPassword } from '@/lib/email-senders/encryption';
import { toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface EmailSenderRow {
  id: string;
  account_id: string;
  name: string;
  from_email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_secure: boolean;
  encrypted_password: string;
}

export async function POST(
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
    const limit = checkRateLimit(
      `email-sender-test:${context.accountId}`,
      RATE_LIMITS.emailSenderTest
    );
    if (!limit.success) return rateLimitResponse(limit);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corpo JSON inválido.' },
        { status: 400 }
      );
    }
    const to =
      typeof body === 'object' &&
      body !== null &&
      'to' in body &&
      typeof body.to === 'string'
        ? body.to.trim()
        : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) {
      return NextResponse.json(
        { error: 'Informe um e-mail válido para receber o teste.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin()
      .from('email_sender_connections')
      .select(
        'id, account_id, name, from_email, from_name, smtp_host, smtp_port, smtp_username, smtp_secure, encrypted_password'
      )
      .eq('id', id)
      .eq('account_id', context.accountId)
      .maybeSingle();
    if (error) {
      console.error('[email-senders/test] load failed:', error.message);
      return NextResponse.json(
        { error: 'Não foi possível carregar o remetente.' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Remetente não encontrado.' },
        { status: 404 }
      );
    }

    let password: string;
    try {
      password = decryptSenderPassword(
        (data as EmailSenderRow).encrypted_password
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown decryption error';
      console.error('[email-senders/test] credential decrypt failed:', message);
      return NextResponse.json(
        {
          error: message.startsWith('ENCRYPTION_KEY')
            ? 'O servidor precisa ter a variável ENCRYPTION_KEY configurada para usar este remetente.'
            : 'Não foi possível descriptografar a credencial. Verifique se a ENCRYPTION_KEY não foi alterada.',
        },
        { status: 503 }
      );
    }

    const sender = data as EmailSenderRow;
    const transporter = nodemailer.createTransport({
      host: sender.smtp_host,
      port: sender.smtp_port,
      secure: sender.smtp_secure,
      requireTLS: !sender.smtp_secure,
      auth: { user: sender.smtp_username, pass: password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });

    try {
      await transporter.sendMail({
        from: sender.from_name
          ? { name: sender.from_name, address: sender.from_email }
          : sender.from_email,
        to,
        subject: 'Teste de envio de e-mail do CRM',
        text: `Este é um e-mail de teste da conexão "${sender.name}".`,
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'SMTP_ERROR';
      console.error('[email-senders/test] SMTP send failed:', code);
      return NextResponse.json(
        {
          error:
            'O envio de teste falhou. Confira host, porta, segurança, usuário e senha do remetente.',
        },
        { status: 502 }
      );
    } finally {
      transporter.close();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
