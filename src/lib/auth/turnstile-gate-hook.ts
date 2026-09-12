/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { APIError, createAuthMiddleware } from 'better-auth/api';

import {
  TURNSTILE_GATED_AUTH_PATHS,
  TURNSTILE_GATE_COOKIE,
  isValidTurnstileGateValue,
  resolveTurnstileGateSecret,
} from '@/lib/auth/turnstile-gate';

/** Error code a client can match on when the gate refuses a request. */
export const TURNSTILE_GATE_ERROR_CODE = 'TURNSTILE_REQUIRED';

const TURNSTILE_GATE_ERROR_MESSAGE = 'Complete the verification challenge before signing in.';

/** The slice of better-auth's middleware context the gate reads. */
export interface TurnstileGateContext {
  path: string;
  /** Present for HTTP requests; absent for server-side `auth.api.*` calls. */
  request?: Request;
  getCookie: (name: string) => string | null | undefined;
}

interface AssertInput {
  ctx: TurnstileGateContext;
  now: number;
  secret: string;
}

export const isTurnstileGatedPath = (path: string): boolean =>
  (TURNSTILE_GATED_AUTH_PATHS as readonly string[]).includes(path);

/**
 * Refuse a browser request to a gated path unless it carries a valid gate
 * cookie. Server-side `auth.api.*` calls carry no `Request` — the signin and
 * signup actions that make them have already verified the Turnstile token
 * themselves — so they pass through untouched.
 */
export const assertTurnstilePassed = ({ ctx, now, secret }: AssertInput): void => {
  if (!isTurnstileGatedPath(ctx.path) || ctx.request === undefined) {
    return;
  }

  const value = ctx.getCookie(TURNSTILE_GATE_COOKIE);
  if (value && isValidTurnstileGateValue({ value, now, secret })) {
    return;
  }

  throw new APIError('FORBIDDEN', {
    code: TURNSTILE_GATE_ERROR_CODE,
    message: TURNSTILE_GATE_ERROR_MESSAGE,
  });
};

/** The hook body, separated from the middleware wrapper so it is unit-testable. */
export const turnstileGateHandler = async (ctx: TurnstileGateContext): Promise<void> => {
  assertTurnstilePassed({ ctx, now: Date.now(), secret: resolveTurnstileGateSecret() });
};

/**
 * better-auth `hooks.before`: runs ahead of every endpoint (HTTP and
 * `auth.api.*` alike) and gates the browser-facing sign-in paths on the
 * Turnstile cookie issued by `passTurnstileChallenge`.
 */
export const turnstileGateBeforeHook = createAuthMiddleware(async (ctx) => {
  await turnstileGateHandler(ctx);
});
