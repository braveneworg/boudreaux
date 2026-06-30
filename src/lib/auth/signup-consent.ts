/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { cookies } from 'next/headers';

/**
 * Short-lived cookie that carries the agreements a user accepted on the signup
 * card across a social OAuth redirect, so the same opt-ins are persisted whether
 * they finish via magic-link or social sign-in. Magic-link reads the toggles
 * directly from the submitted form, so it never needs this cookie.
 *
 * `SameSite=Lax` is required: the OAuth callback is a top-level cross-site
 * redirect (provider → app), and Lax cookies ride top-level navigations. The
 * cookie is `httpOnly` (set server-side by `stashSignupConsent`) and expires in
 * 10 minutes, well within a single OAuth round-trip.
 */
export const SIGNUP_CONSENT_COOKIE = 'signup_consent';

const MAX_AGE_SECONDS = 60 * 10;

// Mirror auth.ts: secure cookies in production, except under E2E where the
// standalone server runs over plain HTTP (a secure cookie would not be sent).
const useSecureCookie = process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true';

/** The decoded consent, as the create hook applies it to a new user. */
export interface SignupConsent {
  termsAcceptedAt: Date;
  allowSmsNotifications: boolean;
  allowEmailNotifications: boolean;
}

/** On-the-wire shape (compact keys, ISO date). */
interface StoredConsent {
  t: string;
  sms: boolean;
  email: boolean;
}

/**
 * Stash the signup opt-ins in the consent cookie. Stamps `termsAcceptedAt` now —
 * the caller only sets the cookie once terms are accepted (the social buttons
 * are otherwise disabled), so the cookie's existence implies terms acceptance.
 */
export const setSignupConsentCookie = async (input: {
  allowSmsNotifications: boolean;
  allowEmailNotifications: boolean;
}): Promise<void> => {
  const stored: StoredConsent = {
    t: new Date().toISOString(),
    sms: input.allowSmsNotifications,
    email: input.allowEmailNotifications,
  };
  const cookieStore = await cookies();
  cookieStore.set(SIGNUP_CONSENT_COOKIE, JSON.stringify(stored), {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureCookie,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
};

/**
 * Read and clear the consent cookie. Returns `null` when it is absent or
 * malformed (the create hook then leaves the new user's opt-ins at their
 * defaults). Single-use: the cookie is deleted as soon as it is read.
 */
export const readAndClearSignupConsent = async (): Promise<SignupConsent | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SIGNUP_CONSENT_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  cookieStore.delete(SIGNUP_CONSENT_COOKIE);
  try {
    const parsed = JSON.parse(raw) as StoredConsent;
    return {
      termsAcceptedAt: new Date(parsed.t),
      allowSmsNotifications: Boolean(parsed.sms),
      allowEmailNotifications: Boolean(parsed.email),
    };
  } catch {
    return null;
  }
};
