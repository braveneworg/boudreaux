/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { auth } from '@/auth';
import type { ServerSession } from '@/lib/auth/get-server-session';

export const requireRole = async (role: string): Promise<ServerSession> => {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== role) {
    throw Error('Unauthorized');
  }

  // Ensure user.id is present for audit logging and security tracking
  if (!session.user.id) {
    throw Error(
      `Invalid session: user ID missing. User ID is required for audit logging and security tracking.`
    );
  }

  return session;
};
