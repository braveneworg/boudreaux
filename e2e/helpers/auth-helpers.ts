import { hkdf } from 'node:crypto';
import { promisify } from 'node:util';

import { EncryptJWT, base64url, calculateJwkThumbprint } from 'jose';

const hkdfAsync = promisify(hkdf);

/**
 * Derive the encryption key from AUTH_SECRET using the same HKDF derivation
 * that Auth.js (@auth/core >=0.41) uses internally.
 *
 * The cookie name is used as both the HKDF salt and in the info string.
 *
 * @see https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/jwt.ts
 */
async function getDerivedEncryptionKey(secret: string, salt: string): Promise<ArrayBuffer> {
  return hkdfAsync(
    'sha256',
    secret,
    salt,
    `Auth.js Generated Encryption Key (${salt})`,
    64 // A256CBC-HS512 requires 64 bytes (512 bits)
  );
}

interface TestUser {
  id: string;
  email: string;
  name: string;
  username: string;
  role: 'user' | 'admin';
  firstName?: string;
  lastName?: string;
  emailVerified?: Date | null;
  image?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  allowSmsNotifications?: boolean;
}

const COOKIE_NAME = 'next-auth.session-token';

/**
 * Create a valid Auth.js JWE session cookie that matches the exact encryption
 * scheme used by the running Next.js application.
 */
async function createAuthCookie(user: TestUser, secret: string) {
  const keyMaterial = await getDerivedEncryptionKey(secret, COOKIE_NAME);
  const encryptionSecret = new Uint8Array(keyMaterial);

  const thumbprint = await calculateJwkThumbprint(
    { kty: 'oct', k: base64url.encode(encryptionSecret) },
    `sha${encryptionSecret.byteLength << 3}` as 'sha256' | 'sha384' | 'sha512'
  );

  const token = await new EncryptJWT({ user })
    .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512', kid: thumbprint })
    .setIssuedAt()
    .setExpirationTime('30d')
    .setJti(crypto.randomUUID())
    .encrypt(encryptionSecret);

  return {
    name: COOKIE_NAME,
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: false,
    expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
}

/**
 * Generate a Playwright storageState object with a valid session cookie
 * for the given test user.
 */
async function createStorageState(user: TestUser, secret: string) {
  const cookie = await createAuthCookie(user, secret);
  return {
    cookies: [cookie],
    origins: [],
  };
}

export { createAuthCookie, createStorageState };
export type { TestUser };
