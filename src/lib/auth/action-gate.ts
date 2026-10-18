/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { auth } from '@/auth';
import type { ServerSession } from '@/lib/auth/get-server-session';

/** Who may cross the gate: any signed-in, unbanned user, or only an admin. */
export type ActionAccess = 'signed-in' | 'admin';

/**
 * Why the gate refused. A closed union of its own, not part of
 * `DataErrorCode`: these are access facts, not data-access failures.
 */
export type ActionGateCode = 'UNAUTHENTICATED' | 'BANNED' | 'FORBIDDEN';

export interface ActionGateRefusal {
  success: false;
  error: string;
  code: ActionGateCode;
}

export type ActionGateResult = { success: true; session: ServerSession } | ActionGateRefusal;

/** The refusal copy, owned here once. Call sites may override it (ADR-0001). */
const refusalCopyFor = (code: ActionGateCode): string =>
  code === 'BANNED' ? 'Account suspended' : 'Unauthorized';

/**
 * The access rule, in order: no session or no user id → `UNAUTHENTICATED`; a
 * banned user → `BANNED` (before the role check, so a banned admin is
 * suspended, not forbidden); `'admin'` access without the admin role →
 * `FORBIDDEN`. A session that passes is returned narrowed.
 *
 * The ban check is defense-in-depth on top of better-auth's own enforcement: a
 * just-banned user can still present a session cookie within the cookie-cache
 * window, and the session's user is re-read from the database.
 */
const decide = (
  session: ServerSession | null,
  access: ActionAccess
): ActionGateCode | ServerSession => {
  if (!session?.user?.id) {
    return 'UNAUTHENTICATED';
  }

  if (session.user.banned) {
    return 'BANNED';
  }

  if (access === 'admin' && session.user.role !== 'admin') {
    return 'FORBIDDEN';
  }

  return session;
};

/**
 * The access rule shared by Server Actions and the route decorators
 * (`withAuth` / `withAdmin`): the code a session is refused with, or `null`
 * when it may cross.
 */
export const refusalFor = (
  session: ServerSession | null,
  access: ActionAccess
): ActionGateCode | null => {
  const decision = decide(session, access);

  return typeof decision === 'string' ? decision : null;
};

/**
 * The action gate: reads the session and applies {@link refusalFor}. A refusal
 * resolves as an {@link ActionGateRefusal}, never a throw, so each Server
 * Action returns it in its own result type. An error from `auth()` itself
 * propagates unchanged.
 */
export const gateAction = async (access: ActionAccess): Promise<ActionGateResult> => {
  const decision = decide(await auth(), access);

  return typeof decision === 'string'
    ? { success: false, error: refusalCopyFor(decision), code: decision }
    : { success: true, session: decision };
};
