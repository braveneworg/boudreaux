/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { magicLink } from 'better-auth/plugins';

import { TURNSTILE_GATE_COOKIE, createTurnstileGateValue } from './turnstile-gate';
import { TURNSTILE_GATE_ERROR_CODE, turnstileGateBeforeHook } from './turnstile-gate-hook';

// `turnstile-gate-hook.spec.ts` proves the decision on a hand-built context.
// This spec proves the two facts that decision rests on against a REAL
// better-auth instance (memory adapter, no network): the router hands the hook
// a `request` for browser calls, and `auth.api.*` calls carry none — so the
// signin/signup actions' own magic-link sends are never blocked.

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const SECRET = `gate-secret-${'a'.repeat(32)}`;
const BASE_URL = 'http://localhost:3000';

const sendMagicLink = vi.fn(async (): Promise<void> => undefined);

const buildAuth = () =>
  betterAuth({
    baseURL: BASE_URL,
    secret: SECRET,
    logger: { disabled: true },
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: false },
    rateLimit: { enabled: false },
    hooks: { before: turnstileGateBeforeHook },
    plugins: [magicLink({ sendMagicLink })],
  });

type Auth = ReturnType<typeof buildAuth>;

const browserPost = (
  auth: Auth,
  path: string,
  body: Record<string, string>,
  gateCookie?: string
): Promise<Response> =>
  auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: BASE_URL,
        ...(gateCookie ? { cookie: `${TURNSTILE_GATE_COOKIE}=${gateCookie}` } : {}),
      },
      body: JSON.stringify(body),
    })
  );

describe('turnstile gate on a real better-auth instance', () => {
  let auth: Auth;

  beforeAll(() => {
    auth = buildAuth();
  });

  beforeEach(() => {
    // The hook reads AUTH_SECRET per request, and the global afterEach in
    // setupTests restores env stubs — so stub it before every case.
    vi.stubEnv('AUTH_SECRET', SECRET);
    sendMagicLink.mockClear();
  });

  it('refuses a browser magic-link request that carries no gate cookie', async () => {
    const response = await browserPost(auth, '/sign-in/magic-link', {
      email: 'gate@example.com',
      callbackURL: '/',
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: TURNSTILE_GATE_ERROR_CODE });
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it('refuses a browser social sign-in request that carries no gate cookie', async () => {
    const response = await browserPost(auth, '/sign-in/social', {
      provider: 'google',
      callbackURL: '/',
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: TURNSTILE_GATE_ERROR_CODE });
  });

  it('lets a browser magic-link request through with a valid gate cookie', async () => {
    const response = await browserPost(
      auth,
      '/sign-in/magic-link',
      { email: 'gate@example.com', callbackURL: '/' },
      createTurnstileGateValue({ now: Date.now(), secret: SECRET })
    );

    expect(response.status).toBe(200);
    expect(sendMagicLink).toHaveBeenCalledTimes(1);
  });

  it('lets a server-side auth.api magic-link call through without any cookie', async () => {
    // What signin-action.ts / signup-action.ts do after verifying the token.
    await auth.api.signInMagicLink({
      body: { email: 'action@example.com', callbackURL: '/' },
      headers: new Headers(),
    });

    expect(sendMagicLink).toHaveBeenCalledTimes(1);
  });

  it('leaves an ungated browser endpoint alone', async () => {
    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, { headers: { origin: BASE_URL } })
    );

    expect(response.status).toBe(200);
  });
});
