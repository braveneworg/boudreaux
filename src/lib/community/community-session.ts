/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { refusalFor } from '@/lib/auth/action-gate';
import type { SubmissionActor } from '@/lib/types/domain/submission';
import type { User } from '@/lib/types/domain/user';

import { mayUseCommunity } from './community-access';

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
 * The signed-in user of a page that needs one: the form and the owner's list.
 * A signed-out visitor is sent to sign in and brought back to `returnTo`. A
 * banned account, or a role the feature is not open to yet, gets not found.
 */
export const requireCommunityUser = async (returnTo: string): Promise<User> => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  }

  if (session.user.banned === true || !mayUseCommunity(session.user.role)) {
    notFound();
  }

  return session.user;
};

/**
 * Who is reading a submission's page: the session's user, or `null` for a
 * signed-out visitor. Until the community page launches, anyone the feature
 * is not open to gets not found here, signed out or not. A banned account is
 * refused outright rather than treated as a visitor.
 */
export const communityViewer = async (): Promise<SubmissionActor | null> => {
  const session = await auth();
  const user = session?.user?.id ? session.user : null;

  if (user?.banned === true || !mayUseCommunity(user?.role)) {
    notFound();
  }

  return user ? { id: user.id, role: user.role } : null;
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
