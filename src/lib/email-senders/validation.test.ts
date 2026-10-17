import { describe, expect, it } from 'vitest';
import { validateEmailSenderInput } from './validation';

const validInput = {
  name: 'Comercial',
  provider: 'gmail_smtp',
  fromEmail: 'comercial@malybo.com.br',
  fromName: 'Malybo',
  smtpHost: 'smtp.invalid.example',
  smtpPort: 465,
  smtpUsername: 'comercial@malybo.com.br',
  smtpSecure: true,
  password: 'app-password',
};

describe('email sender input validation', () => {
  it("pins Gmail connections to Google's SMTP host", () => {
    const result = validateEmailSenderInput(validInput, {
      passwordRequired: true,
    });

    expect('input' in result && result.input.smtpHost).toBe('smtp.gmail.com');
  });

  it("uses STARTTLS for Gmail's 587 port", () => {
    const result = validateEmailSenderInput(
      { ...validInput, smtpPort: 587, smtpSecure: true },
      { passwordRequired: true }
    );

    expect('input' in result && result.input.smtpSecure).toBe(false);
  });

  it('rejects a missing password when creating a sender', () => {
    const result = validateEmailSenderInput(
      { ...validInput, password: '' },
      { passwordRequired: true }
    );

    expect('error' in result).toBe(true);
  });

  it('allows an unchanged password to be omitted during edits', () => {
    const result = validateEmailSenderInput(
      { ...validInput, password: '' },
      { passwordRequired: false }
    );

    expect('input' in result).toBe(true);
  });

  it('rejects local and IP-literal SMTP destinations', () => {
    for (const smtpHost of ['localhost', '127.0.0.1', 'smtp.local']) {
      const result = validateEmailSenderInput(
        { ...validInput, provider: 'custom_smtp', smtpHost },
        { passwordRequired: true }
      );
      expect('error' in result).toBe(true);
    }
  });
});
