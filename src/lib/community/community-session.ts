/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { refusalFor } from '@/lib/auth/action-gate';
import type { SubmissionActor } from '@/lib/types/domain/submission';
import type { User } from '@/lib/types/domain/user';

/**
 * Who a community page is being rendered for (ADR-0025). Every page asks
 * here in its own body, never only in a layout: a layout does not render
 * again on a client-side navigation between its pages, so a check that lives
 * there alone is skipped by the second page a reader opens.
 *
 * A refusal is the not-found page, never "forbidden", so an address does not
 * reveal that a page exists.
 */

/**
 * The signed-in user of a page that needs one: the form, the owner's list
 * and a submission's edit page. A signed-out visitor is sent to sign in and
 * brought back to `returnTo`. A banned account gets not found.
 *
 * The proxy already answers a request with no session cookie with a real
 * redirect, before the page starts. This is the check that counts: it reads
 * the session itself, so a cookie that no longer names one is caught here.
 * Under the root loading boundary its redirect happens in the browser.
 */
export const requireCommunityUser = async (returnTo: string): Promise<User> => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  }

  if (session.user.banned === true) {
    notFound();
  }

  return session.user;
};

/**
 * Who is reading a public community page: the session's user, or `null` for
 * a signed-out visitor, who is a reader like any other. A banned account is
 * refused outright rather than treated as a visitor.
 */
export const communityViewer = async (): Promise<SubmissionActor | null> => {
  const session = await auth();
  const user = session?.user?.id ? session.user : null;

  if (user?.banned === true) {
    notFound();
  }

  return user ? { id: user.id, role: user.role } : null;
};

/** Who is calling a public community route: a banned account, or the viewer (`null` is a guest). */
export type CommunityCaller = { banned: true } | { banned: false; viewer: SubmissionActor | null };

/**
 * The caller of a public community route, which takes no session: the
 * session's user, or a guest. A route answers a banned account itself, in
 * the one way it answers every refusal, so this says so and never throws.
 */
export const communityCaller = async (): Promise<CommunityCaller> => {
  const session = await auth();
  const user = session?.user?.id ? session.user : null;
  if (user?.banned === true) {
    return { banned: true };
  }

  return { banned: false, viewer: user ? { id: user.id, role: user.role ?? null } : null };
};

/**
 * The signed-in approver of an approver page, by the action gate's own rule:
 * `'approver'` admits an admin or a manager, `'admin'` an admin alone. Anyone
 * else, a signed-out visitor included, gets not found.
 */
export const requireApprover = async (access: 'approver' | 'admin'): Promise<User> => {
  const session = await auth();
  if (!session || refusalFor(session, access) !== null) {
    notFound();
  }

  return session.user;
};
