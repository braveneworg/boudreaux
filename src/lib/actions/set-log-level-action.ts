/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import type { ServerSession } from '@/lib/auth/get-server-session';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { setRuntimeLogLevel } from '@/lib/utils/logger';
import type { LogLevelState } from '@/lib/utils/logger';
import { setLogLevelSchema } from '@/lib/validation/log-level-schema';
import type { SetLogLevelInput } from '@/lib/validation/log-level-schema';

const DEFAULT_TTL_MINUTES = 60;

export type SetLogLevelActionResult =
  | { success: true; state: LogLevelState }
  | { success: false; error: 'unauthorized' | 'invalid' };

/**
 * Admin-only: override the runtime log level (or clear the override with
 * `level: null`). Overrides auto-revert after `ttlMinutes` (default 60).
 */
export const setLogLevelAction = async (
  input: SetLogLevelInput
): Promise<SetLogLevelActionResult> => {
  let session: ServerSession;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = setLogLevelSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'invalid' };
  }

  const { level, ttlMinutes } = parsed.data;
  const state =
    level === null
      ? setRuntimeLogLevel(null)
      : setRuntimeLogLevel(level, (ttlMinutes ?? DEFAULT_TTL_MINUTES) * 60_000);

  logSecurityEvent({
    event: 'admin.log_level.changed',
    userId: session.user?.id,
    metadata: {
      level,
      ...(level !== null && { ttlMinutes: ttlMinutes ?? DEFAULT_TTL_MINUTES }),
      expiresAt: state.expiresAt,
    },
  });

  return { success: true, state };
};
