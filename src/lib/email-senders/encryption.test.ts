import { afterEach, describe, expect, it } from 'vitest';
import { decryptSenderPassword, encryptSenderPassword } from './encryption';

const originalEncryptionKey = process.env.ENCRYPTION_KEY;
const TEST_KEY = 'ab'.repeat(32);

afterEach(() => {
  if (originalEncryptionKey === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  }
});

describe('email sender credential encryption', () => {
  it('round-trips a password and uses a fresh authenticated ciphertext', () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const first = encryptSenderPassword('app-password-123');
    const second = encryptSenderPassword('app-password-123');

    expect(first).not.toBe(second);
    expect(decryptSenderPassword(first)).toBe('app-password-123');
    expect(decryptSenderPassword(second)).toBe('app-password-123');
  });

  it('rejects tampered ciphertext', () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    const [version, iv, tag, ciphertext] =
      encryptSenderPassword('secret').split(':');
    const replacement = `${ciphertext.slice(0, 2) === '00' ? 'ff' : '00'}${ciphertext.slice(2)}`;

    expect(() =>
      decryptSenderPassword(`${version}:${iv}:${tag}:${replacement}`)
    ).toThrow();
  });

  it('fails explicitly when the master key is missing or malformed', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSenderPassword('secret')).toThrow(/ENCRYPTION_KEY/);

    process.env.ENCRYPTION_KEY = 'not-a-key';
    expect(() => encryptSenderPassword('secret')).toThrow(/ENCRYPTION_KEY/);
  });
});
