/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { BetterAuthPlugin, Session, User } from 'better-auth';

vi.mock('server-only', () => ({}));

// setSessionCookie is the supported better-auth helper that signs + sets the
// session cookie; the plugin only invokes it through the `setCookie` dep, so we
// assert that dep is called rather than re-testing better-auth internals.
vi.mock('better-auth/cookies', () => ({
  setSessionCookie: vi.fn(),
}));

const { setSessionCookie } = await import('better-auth/cookies');
const { buildPurchaseSessionDeps, handlePurchaseSession, purchaseSessionPlugin } =
  await import('./purchase-session-plugin');

const fakeUser = { id: 'user-123', email: 'buyer@example.com' };
const fakeSession = { token: 'sess-token', userId: 'user-123' };

interface DepsOverrides {
  user?: unknown;
  session?: unknown;
  userId?: string;
}

const makeDeps = ({
  user = fakeUser,
  session = fakeSession,
  userId = 'user-123',
}: DepsOverrides) => {
  const findUserById = vi.fn().mockResolvedValue(user);
  const createSession = vi.fn().mockResolvedValue(session);
  const setCookie = vi.fn().mockResolvedValue(undefined);
  return { userId, findUserById, createSession, setCookie };
};

describe('purchaseSessionPlugin', () => {
  it('registers an endpoint named createPurchaseSession', () => {
    expect(purchaseSessionPlugin.id).toBe('purchase-session');
    expect(purchaseSessionPlugin.endpoints?.createPurchaseSession).toBeDefined();
  });

  it('keeps the endpoint off the HTTP router via SERVER_ONLY metadata', () => {
    // `SERVER_ONLY` is the better-auth flag better-call's router skips. Read it
    // through the BetterAuthPlugin view, where `metadata` is the open record.
    const endpoint = (purchaseSessionPlugin as BetterAuthPlugin).endpoints?.createPurchaseSession;
    const metadata = endpoint?.options.metadata as { SERVER_ONLY?: boolean } | undefined;
    expect(metadata?.SERVER_ONLY).toBe(true);
  });
});

describe('buildPurchaseSessionDeps', () => {
  // A structural stand-in for the better-auth endpoint context: the deps only
  // touch `body.userId` and `context.internalAdapter`. The real
  // GenericEndpointContext cannot be constructed in a unit test, so the minimal
  // shape is cast to the parameter type.
  const makeCtx = () => {
    const findUserById = vi.fn().mockResolvedValue(fakeUser);
    const createSession = vi.fn().mockResolvedValue(fakeSession);
    const ctx = {
      body: { userId: 'user-123' },
      context: { internalAdapter: { findUserById, createSession } },
    } as unknown as Parameters<typeof buildPurchaseSessionDeps>[0];
    return { ctx, findUserById, createSession };
  };

  it('carries the userId from the validated request body', () => {
    const { ctx } = makeCtx();

    expect(buildPurchaseSessionDeps(ctx).userId).toBe('user-123');
  });

  it('routes findUserById to the better-auth internal adapter', async () => {
    const { ctx, findUserById } = makeCtx();

    await buildPurchaseSessionDeps(ctx).findUserById('user-123');

    expect(findUserById).toHaveBeenCalledWith('user-123');
  });

  it('routes createSession to the better-auth internal adapter', async () => {
    const { ctx, createSession } = makeCtx();

    await buildPurchaseSessionDeps(ctx).createSession('user-123');

    expect(createSession).toHaveBeenCalledWith('user-123');
  });

  it('sets the cookie via better-auth setSessionCookie with the endpoint ctx', async () => {
    const { ctx } = makeCtx();

    await buildPurchaseSessionDeps(ctx).setCookie(
      fakeSession as unknown as Session,
      fakeUser as unknown as User
    );

    expect(setSessionCookie).toHaveBeenCalledWith(ctx, { session: fakeSession, user: fakeUser });
  });
});

describe('handlePurchaseSession', () => {
  it('creates a better-auth session for the resolved userId', async () => {
    const deps = makeDeps({});

    await handlePurchaseSession(deps);

    expect(deps.createSession).toHaveBeenCalledWith('user-123');
  });

  it('sets the session cookie with the created session and the user record', async () => {
    const deps = makeDeps({});

    await handlePurchaseSession(deps);

    expect(deps.setCookie).toHaveBeenCalledWith(fakeSession, fakeUser);
  });

  it('reports success after the session is created and the cookie is set', async () => {
    const deps = makeDeps({});

    await expect(handlePurchaseSession(deps)).resolves.toEqual({ status: true });
  });

  it('throws and sets no cookie when the user no longer exists', async () => {
    const deps = makeDeps({ user: null });

    await expect(handlePurchaseSession(deps)).rejects.toThrow();
    expect(deps.setCookie).not.toHaveBeenCalled();
    expect(deps.createSession).not.toHaveBeenCalled();
  });

  it('throws and sets no cookie when session creation is rejected (ban gate returns null)', async () => {
    // The `session.create.before` ban-evasion hook returning false makes
    // internalAdapter.createSession resolve to null — no cookie must be set.
    const deps = makeDeps({ session: null });

    await expect(handlePurchaseSession(deps)).rejects.toThrow();
    expect(deps.setCookie).not.toHaveBeenCalled();
  });
});
