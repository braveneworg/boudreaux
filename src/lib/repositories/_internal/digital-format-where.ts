/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPresent, isUnset } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Digital-format `where` fragments. Formats are soft-deleted by stamping
 * `deletedAt`; a never-deleted row usually has no `deletedAt` field at all
 * (Prisma omits optional fields on create), so a bare `{ deletedAt: null }`
 * misses it. Proved by `digital-format-where.contract.spec.ts`.
 */
export const digitalFormatWhere = {
  /** Active: not soft-deleted — `deletedAt` is null or absent. */
  active: isUnset('deletedAt'),

  /** Withdrawn: soft-deleted — `deletedAt` holds a date. */
  withdrawn: isPresent('deletedAt'),
  /**
   * Has something to download: at least one track file, or a legacy
   * single-file `fileName`. `{ not: null }` alone excludes an absent
   * `fileName` on Mongo, so no `isSet` guard is needed beside it.
   */
  hasFiles: { OR: [{ files: { some: {} } }, isPresent('fileName')] },
} as const satisfies Record<string, Prisma.ReleaseDigitalFormatWhereInput>;
