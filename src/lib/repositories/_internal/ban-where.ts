/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPresent, isUnset } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Banned-identity `where` fragments. A ban is lifted by stamping
 * `unbannedAt`; the row is kept for audit. A ban that was never lifted has no
 * `unbannedAt` field at all, so a bare `{ unbannedAt: null }` misses it.
 * Proved by `ban-where.contract.spec.ts`.
 */
export const banWhere = {
  /** Active: not lifted — `unbannedAt` null or absent. */
  active: isUnset('unbannedAt'),
  /** Lifted: `unbannedAt` holds a date. */
  lifted: isPresent('unbannedAt'),
} as const satisfies Record<string, Prisma.BannedIdentityWhereInput>;
