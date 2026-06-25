/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { APIError, type BetterAuthPlugin, type Session, type User } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import * as z from 'zod';

/**
 * Narrow dependency surface the {@link handlePurchaseSession} core needs, so the
 * trust logic is unit-testable without a full better-auth endpoint context. The
 * endpoint wiring below adapts the real `ctx` onto this shape.
 */
export interface PurchaseSessionDeps {
  /** The userId already resolved from the Stripe trust anchor by the caller. */
  readonly userId: string;
  /** Look up the authoritative user record (better-auth internal adapter). */
  readonly findUserById: (userId: string) => Promise<User | null>;
  /**
   * Create a real better-auth session row. Returns `null` when the
   * `session.create.before` ban-evasion hook rejects it (banned identity).
   */
  readonly createSession: (userId: string) => Promise<Session | null>;
  /** Set the signed better-auth session cookie for the created session + user. */
  readonly setCookie: (session: Session, user: User) => Promise<void>;
}

/**
 * Core of the server-only `createPurchaseSession` endpoint, factored out for
 * direct unit testing.
 *
 * Mints a REAL better-auth session for a userId that the caller has already
 * authenticated via a separate trust anchor (the Stripe checkout session id),
 * then sets the better-auth session cookie so `auth.api.getSession`, middleware,
 * and chat all honor it.
 *
 * Throws (never silently sets a cookie) when the user no longer exists or when
 * session creation is rejected — e.g. the ban-evasion gate in
 * `databaseHooks.session.create.before` returns `false`, which makes
 * `createSession` resolve to `null`.
 */
export const handlePurchaseSession = async ({
  userId,
  findUserById,
  createSession,
  setCookie,
}: PurchaseSessionDeps): Promise<{ status: true }> => {
  const user = await findUserById(userId);
  if (!user) {
    throw new APIError('NOT_FOUND', { message: 'User not found' });
  }

  const session = await createSession(userId);
  if (!session) {
    // Either the ban-evasion hook rejected the session or the adapter failed —
    // do NOT set a cookie for a session that was never created.
    throw new APIError('FORBIDDEN', { message: 'Session could not be created' });
  }

  await setCookie(session, user);

  return { status: true };
};

const createPurchaseSessionBodySchema = z.object({
  userId: z.string().min(1),
});

/**
 * better-auth plugin exposing a **server-only** `createPurchaseSession` endpoint
 * (callable as `auth.api.createPurchaseSession` from trusted server code, never
 * mounted on the public HTTP router — `createAuthEndpoint.serverOnly` sets
 * `metadata.SERVER_ONLY`, which better-call's router skips).
 *
 * The endpoint takes an already-resolved `userId` (the Stripe-session trust
 * anchor is verified by the calling Server Action) and creates a real session +
 * cookie via the better-auth internal adapter and `setSessionCookie`. Because it
 * is HTTP-unreachable, accepting a raw userId here is safe.
 */
/**
 * The better-auth endpoint context the `createPurchaseSession` handler receives,
 * narrowed to the `userId` body this endpoint validates. The base
 * (`GenericEndpointContext`) is sourced from `setSessionCookie`'s own parameter
 * so it can never drift from the installed better-auth version.
 */
type PurchaseSessionEndpointContext = Parameters<typeof setSessionCookie>[0] & {
  body: { userId: string };
};

/**
 * Adapt a better-auth endpoint `ctx` onto the {@link PurchaseSessionDeps} the
 * {@link handlePurchaseSession} core consumes. Extracted from the endpoint
 * handler so the ctx→internal-adapter wiring (session creation runs the
 * ban-evasion `session.create.before` hook; the cookie is set via the supported
 * `setSessionCookie` helper) is unit-testable without standing up a full
 * better-auth endpoint context and a live Mongo adapter.
 */
export const buildPurchaseSessionDeps = (
  ctx: PurchaseSessionEndpointContext
): PurchaseSessionDeps => ({
  userId: ctx.body.userId,
  findUserById: (userId) => ctx.context.internalAdapter.findUserById(userId),
  createSession: (userId) => ctx.context.internalAdapter.createSession(userId),
  setCookie: (session, user) => setSessionCookie(ctx, { session, user }),
});

export const purchaseSessionPlugin = {
  id: 'purchase-session',
  endpoints: {
    createPurchaseSession: createAuthEndpoint.serverOnly(
      {
        method: 'POST',
        body: createPurchaseSessionBodySchema,
      },
      async (ctx) => ctx.json(await handlePurchaseSession(buildPurchaseSessionDeps(ctx)))
    ),
  },
} satisfies BetterAuthPlugin;
