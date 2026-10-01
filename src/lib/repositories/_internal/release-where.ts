/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { allOf, isPresent, isUnset } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Release `where` fragments. Every repository read of a Release composes
 * these instead of spelling `publishedAt` / `deletedOn` by hand, and
 * `release-where.contract.spec.ts` proves each one against Docker Mongo.
 *
 * "Public" always implies "not deleted": there is deliberately no exported
 * published-only fragment. A caller that wants deleted-but-published rows has
 * to compose it by hand and say why.
 */
export const releaseWhere = {
  /** Not soft-deleted — `deletedOn` is null or absent. */
  notDeleted: isUnset('deletedOn'),

  /** Soft-deleted — `deletedOn` holds a date. */
  deleted: isPresent('deletedOn'),

  /** Never published — `publishedAt` is null or absent (admin draft filter). */
  unpublished: isUnset('publishedAt'),

  /**
   * Listed: published and not deleted. The only fragment a public read may
   * use. `AND`-wrapped so a caller can add its own `OR` (search) beside it.
   */
  listed: { ...isPresent('publishedAt'), ...allOf(isUnset('deletedOn')) },
} as const satisfies Record<string, Prisma.ReleaseWhereInput>;

/**
 * Admin "published?" tri-state: `true` → published (deleted rows included —
 * admin lists filter deletion separately), `false` → never published,
 * `undefined` → no clause.
 */
export const releasePublishedFilter = (published: boolean | undefined): Prisma.ReleaseWhereInput =>
  published === true
    ? isPresent('publishedAt')
    : published === false
      ? releaseWhere.unpublished
      : {};
