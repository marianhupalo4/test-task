import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const TOKEN_PREFIX = 'evk_';

export class DecryptionError extends Error {
  constructor() {
    super('Decryption failed');
  }
}

export interface Encrypted {
  ciphertext: Buffer;
  nonce: Buffer;
}

export function generateKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function encrypt(key: Buffer, plaintext: Buffer, aad: Buffer): Encrypted {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext, nonce };
}

export function decrypt(key: Buffer, ciphertext: Buffer, nonce: Buffer, aad: Buffer): Buffer {
  try {
    const body = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);
    const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new DecryptionError();
  }
}

export function encodeAad(...fields: string[]): Buffer {
  return Buffer.concat(
    fields.flatMap((field) => {
      const bytes = Buffer.from(field, 'utf8');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      return [length, bytes];
    }),
  );
}

export function credentialAad(credentialId: string, clientId: string, keyVersion: number): Buffer {
  return encodeAad(credentialId.toLowerCase(), clientId, String(keyVersion));
}

export function clientKeyAad(
  clientId: string,
  keyVersion: number,
  masterKeyVersion: number,
): Buffer {
  return encodeAad(clientId, String(keyVersion), String(masterKeyVersion));
}

export function generateServiceToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function hashServiceToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
