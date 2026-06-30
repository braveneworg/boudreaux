/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ServerSession } from '@/lib/auth/get-server-session';

/**
 * Narrowing guard for the image-management actions' inline admin check:
 * a present user id plus the `admin` role. Used as
 * `if (!isAdminSession(session)) return { success: false, error: 'Unauthorized' }`,
 * after which `session` is a non-null {@link ServerSession}. Mirrors the prior
 * `!session?.user?.id || session?.user?.role !== 'admin'` guard exactly.
 */
export const isAdminSession = (session: ServerSession | null): session is ServerSession =>
  Boolean(session?.user?.id) && session?.user?.role === 'admin';
