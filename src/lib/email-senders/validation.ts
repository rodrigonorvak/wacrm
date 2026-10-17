import { isIP } from 'node:net';

export type EmailSenderProvider = 'gmail_smtp' | 'custom_smtp';

export interface EmailSenderInput {
  name: string;
  provider: EmailSenderProvider;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpSecure: boolean;
  password: string;
}

type ValidationResult = { input: EmailSenderInput } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateEmailSenderInput(
  value: unknown,
  options: { passwordRequired: boolean }
): ValidationResult {
  if (!isRecord(value)) return { error: 'Dados do remetente inválidos.' };

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const provider = value.provider;
  const fromEmail =
    typeof value.fromEmail === 'string' ? value.fromEmail.trim() : '';
  const fromName =
    typeof value.fromName === 'string' ? value.fromName.trim() : '';
  const smtpUsername =
    typeof value.smtpUsername === 'string' ? value.smtpUsername.trim() : '';
  const password = typeof value.password === 'string' ? value.password : '';
  const smtpHostRaw =
    typeof value.smtpHost === 'string' ? value.smtpHost.trim() : '';
  const smtpPort = Number(value.smtpPort);
  const smtpSecure = value.smtpSecure;

  if (!name || name.length > 80) {
    return { error: 'Informe um nome de até 80 caracteres para a conexão.' };
  }
  if (provider !== 'gmail_smtp' && provider !== 'custom_smtp') {
    return { error: 'Escolha um tipo de conexão válido.' };
  }
  if (fromEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return { error: 'Informe um endereço de remetente válido.' };
  }
  if (fromName.length > 120 || /[\r\n\0]/.test(fromName)) {
    return { error: 'O nome do remetente deve ter até 120 caracteres.' };
  }
  if (!smtpUsername || smtpUsername.length > 254) {
    return { error: 'Informe o usuário de autenticação SMTP.' };
  }
  if (options.passwordRequired && !password) {
    return { error: 'Informe a senha SMTP ou a senha de app do Google.' };
  }
  if (password.length > 2048) {
    return { error: 'A senha SMTP excede o tamanho permitido.' };
  }
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    return { error: 'Informe uma porta SMTP válida.' };
  }
  if (typeof smtpSecure !== 'boolean') {
    return { error: 'Escolha a configuração de conexão segura.' };
  }

  if (provider === 'gmail_smtp') {
    if (smtpPort !== 465 && smtpPort !== 587) {
      return { error: 'O Gmail aceita as portas SMTP 465 ou 587.' };
    }
    const gmailPassword = password.replace(/\s+/g, '');
    return {
      input: {
        name,
        provider,
        fromEmail,
        fromName,
        smtpHost: 'smtp.gmail.com',
        smtpPort,
        smtpUsername,
        smtpSecure: smtpPort === 465,
        password: gmailPassword,
      },
    };
  }

  if (
    !smtpHostRaw ||
    smtpHostRaw.length > 253 ||
    !/^[a-z0-9.-]+$/i.test(smtpHostRaw) ||
    isIP(smtpHostRaw) !== 0 ||
    /(^|\.)(localhost|local|internal)$/i.test(smtpHostRaw)
  ) {
    return {
      error: 'Informe um servidor SMTP válido, sem protocolo ou caminho.',
    };
  }

  return {
    input: {
      name,
      provider,
      fromEmail,
      fromName,
      smtpHost: smtpHostRaw,
      smtpPort,
      smtpUsername,
      smtpSecure,
      password,
    },
  };
}
