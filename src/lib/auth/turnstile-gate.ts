/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { useSecureAuthCookies } from '@/lib/auth/secure-cookies';

/**
 * Proof that this browser passed the Cloudflare Turnstile challenge.
 *
 * A Turnstile token is single-use: whichever server action verifies it (the
 * signin confirm action, or signup's consent stash) issues this cookie, and
 * better-auth's before hook (`turnstile-gate-hook.ts`) then requires it on the
 * browser-facing sign-in endpoints. That makes "disabled until the challenge
 * passes" a property of the server, not of the buttons — a client that skips
 * the widget and POSTs to `/api/auth/sign-in/*` directly is refused.
 *
 * The value is `<issuedAtMs>.<HMAC-SHA256(issuedAtMs, AUTH_SECRET)>` — nothing
 * to store, nothing to look up — and it expires well within one sign-in.
 * `SameSite=Lax` so it survives the top-level redirect into the OAuth flow;
 * `httpOnly` so scripts can neither read nor forge it.
 */
export const TURNSTILE_GATE_COOKIE = 'turnstile_passed';

export const TURNSTILE_GATE_MAX_AGE_SECONDS = 60 * 10;

/** better-auth endpoint paths a browser may only call after passing the challenge. */
export const TURNSTILE_GATED_AUTH_PATHS = ['/sign-in/social', '/sign-in/magic-link'] as const;

interface SignedValueInput {
  now: number;
  secret: string;
}

interface VerifyValueInput extends SignedValueInput {
  value: string;
}

const sign = (issuedAt: string, secret: string): string =>
  createHmac('sha256', secret).update(issuedAt).digest('base64url');

const signaturesMatch = (actual: string, expected: string): boolean => {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
};

/** Mint a gate value for `now` (epoch ms), signed with `secret`. */
export const createTurnstileGateValue = ({ now, secret }: SignedValueInput): string => {
  const issuedAt = String(now);
  return `${issuedAt}.${sign(issuedAt, secret)}`;
};

/**
 * Check a gate value: well-formed, signature intact, issued no later than
 * `now`, and no older than the max age. Pure, so the hook and the cookie
 * writer share one definition of "valid".
 */
export const isValidTurnstileGateValue = ({ value, now, secret }: VerifyValueInput): boolean => {
  const parts = value.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [issuedAt, signature] = parts;
  if (issuedAt === '' || signature === '' || !signaturesMatch(signature, sign(issuedAt, secret))) {
    return false;
  }

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return false;
  }

  const ageMs = now - issuedAtMs;
  return ageMs >= 0 && ageMs <= TURNSTILE_GATE_MAX_AGE_SECONDS * 1000;
};

/**
 * The signing secret. better-auth's own `AUTH_SECRET` is reused so there is
 * one secret to rotate; `auth.ts` already refuses to boot without it.
 */
export const resolveTurnstileGateSecret = (): string => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required to sign the Turnstile gate cookie');
  }
  return secret;
};

/** Issue the gate cookie for the current request. Call only after `verifyTurnstile` succeeds. */
export const setTurnstileGateCookie = async (): Promise<void> => {
  const secret = resolveTurnstileGateSecret();
  const cookieStore = await cookies();
  cookieStore.set(TURNSTILE_GATE_COOKIE, createTurnstileGateValue({ now: Date.now(), secret }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureAuthCookies,
    path: '/',
    maxAge: TURNSTILE_GATE_MAX_AGE_SECONDS,
  });
};
