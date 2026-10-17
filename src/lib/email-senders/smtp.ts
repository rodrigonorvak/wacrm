import nodemailer, { type SendMailOptions } from 'nodemailer';

export interface EmailSenderSmtpConfig {
  from_email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_secure: boolean;
}

type EmailPayload = Pick<
  SendMailOptions,
  'to' | 'subject' | 'text' | 'html' | 'headers'
>;

export async function sendEmailThroughSender(
  sender: EmailSenderSmtpConfig,
  password: string,
  message: EmailPayload
): Promise<void> {
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
      ...message,
    });
  } finally {
    transporter.close();
  }
}
