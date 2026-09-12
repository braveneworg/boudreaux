/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { APIError } from 'better-auth/api';

import { createTurnstileGateValue } from './turnstile-gate';
import {
  TURNSTILE_GATE_ERROR_CODE,
  assertTurnstilePassed,
  isTurnstileGatedPath,
  turnstileGateBeforeHook,
  turnstileGateHandler,
} from './turnstile-gate-hook';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const SECRET = `gate-secret-${'a'.repeat(32)}`;
const NOW = Date.parse('2026-09-12T12:00:00.000Z');

interface FakeContext {
  path: string;
  request?: Request;
  getCookie: (name: string) => string | null;
}

const httpRequest = (): Request =>
  new Request('http://localhost:3000/api/auth/sign-in/social', { method: 'POST' });

const contextFor = ({
  path,
  cookie,
  request,
}: {
  path: string;
  cookie?: string;
  request?: Request;
}): FakeContext => ({
  path,
  request,
  getCookie: () => cookie ?? null,
});

/** Run `run` and hand back whatever it threw (undefined when it did not). */
const thrownBy = (run: () => void): unknown => {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }
  return undefined;
};

/** The shape every gate refusal must have: a better-auth 403 with our code. */
const FORBIDDEN_BY_GATE = {
  status: 'FORBIDDEN',
  body: { code: TURNSTILE_GATE_ERROR_CODE },
};

describe('isTurnstileGatedPath', () => {
  it.each(['/sign-in/social', '/sign-in/magic-link'])('gates %s', (path) => {
    expect(isTurnstileGatedPath(path)).toBe(true);
  });

  it.each(['/get-session', '/callback/google', '/link-social', '/sign-out', '/magic-link/verify'])(
    'leaves %s open',
    (path) => {
      expect(isTurnstileGatedPath(path)).toBe(false);
    }
  );
});

describe('assertTurnstilePassed', () => {
  it('ignores an ungated path even without a cookie', () => {
    const ctx = contextFor({ path: '/get-session', request: httpRequest() });

    expect(() => assertTurnstilePassed({ ctx, now: NOW, secret: SECRET })).not.toThrow();
  });

  it('ignores a server-side auth.api call (no HTTP request) on a gated path', () => {
    // The signin/signup actions verify the Turnstile token themselves before
    // calling auth.api.signInMagicLink — that call carries no Request.
    const ctx = contextFor({ path: '/sign-in/magic-link' });

    expect(() => assertTurnstilePassed({ ctx, now: NOW, secret: SECRET })).not.toThrow();
  });

  it('rejects a browser request on a gated path without the gate cookie', () => {
    const ctx = contextFor({ path: '/sign-in/social', request: httpRequest() });

    const thrown = thrownBy(() => assertTurnstilePassed({ ctx, now: NOW, secret: SECRET }));

    expect(thrown).toBeInstanceOf(APIError);
    expect(thrown).toMatchObject(FORBIDDEN_BY_GATE);
  });

  it('rejects a browser request carrying a forged gate cookie', () => {
    const ctx = contextFor({
      path: '/sign-in/magic-link',
      request: httpRequest(),
      cookie: `${NOW}.forged-signature`,
    });

    const thrown = thrownBy(() => assertTurnstilePassed({ ctx, now: NOW, secret: SECRET }));

    expect(thrown).toMatchObject(FORBIDDEN_BY_GATE);
  });

  it('rejects a browser request carrying an expired gate cookie', () => {
    const ctx = contextFor({
      path: '/sign-in/social',
      request: httpRequest(),
      cookie: createTurnstileGateValue({ now: NOW - 60 * 60 * 1000, secret: SECRET }),
    });

    const thrown = thrownBy(() => assertTurnstilePassed({ ctx, now: NOW, secret: SECRET }));

    expect(thrown).toMatchObject(FORBIDDEN_BY_GATE);
  });

  it('lets a browser request through with a valid gate cookie', () => {
    const ctx = contextFor({
      path: '/sign-in/social',
      request: httpRequest(),
      cookie: createTurnstileGateValue({ now: NOW - 1_000, secret: SECRET }),
    });

    expect(() => assertTurnstilePassed({ ctx, now: NOW, secret: SECRET })).not.toThrow();
  });
});

describe('turnstileGateHandler', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', SECRET);
  });

  it('signs and checks with AUTH_SECRET at request time', async () => {
    const ctx = contextFor({
      path: '/sign-in/social',
      request: httpRequest(),
      cookie: createTurnstileGateValue({ now: Date.now(), secret: SECRET }),
    });

    await expect(turnstileGateHandler(ctx)).resolves.toBeUndefined();
  });

  it('rejects when the cookie was signed with a different secret', async () => {
    const ctx = contextFor({
      path: '/sign-in/social',
      request: httpRequest(),
      cookie: createTurnstileGateValue({ now: Date.now(), secret: `${SECRET}-other` }),
    });

    await expect(turnstileGateHandler(ctx)).rejects.toBeInstanceOf(APIError);
  });

  it('is wrapped as a better-auth middleware', () => {
    expect(turnstileGateBeforeHook).toBeDefined();
  });
});
