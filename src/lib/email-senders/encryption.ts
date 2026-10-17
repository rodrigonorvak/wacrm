import crypto from 'node:crypto';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hexadecimal key');
  }

  const masterKey = Buffer.from(keyHex, 'hex');
  return crypto
    .createHmac('sha256', masterKey)
    .update('wacrm/email-sender-password/v1')
    .digest();
}

export function encryptSenderPassword(password: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(password, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    ciphertext.toString('hex'),
  ].join(':');
}

export function decryptSenderPassword(payload: string): string {
  const [version, ivHex, tagHex, ciphertextHex, ...extra] = payload.split(':');
  if (
    version !== 'v1' ||
    extra.length > 0 ||
    !ivHex ||
    !tagHex ||
    !ciphertextHex
  ) {
    throw new Error('Unrecognized encrypted email credential format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Encrypted email credential has invalid dimensions');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    iv
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
