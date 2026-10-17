/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { allOf, isPresent, isUnset } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Video `where` fragments. A Video is a **draft** until `publishedAt` is
 * stamped; the stamp is its go-live moment, which may lie in the future
 * (**scheduled**) or the past (**live**). `archivedAt` works the same way for
 * the archive. Both fields are usually absent, not null, on rows that never
 * had them (Prisma omits optional fields on create), so a bare
 * `{ field: null }` misses them. Proved by `video-where.contract.spec.ts`.
 */
export const videoWhere = {
  /** Draft: no go-live moment recorded — `publishedAt` null or absent. */
  draft: isUnset('publishedAt'),
  /** Published: a go-live moment is recorded, past or future (scheduled ∪ live). */
  published: isPresent('publishedAt'),
  /** Archived: `archivedAt` holds a date. */
  archived: isPresent('archivedAt'),
  /** Not archived: `archivedAt` null or absent. */
  notArchived: isUnset('archivedAt'),
} as const satisfies Record<string, Prisma.VideoWhereInput>;

/** Live at `now`: the go-live moment has arrived. What the public reads. */
export const videoLiveAt = (now: Date): Prisma.VideoWhereInput => ({
  publishedAt: { not: null, lte: now },
});

/**
 * Public at `now`: not archived and live. What every public video read
 * filters on — the same `AND` that `buildListWhere({ visibleAt })` in
 * `video-repository.ts` builds for the `/videos` listing. `AND`-wrapped, so it
 * sits beside a caller's own `OR` or `title` clause.
 */
export const publicVideoWhere = (now: Date): Prisma.VideoWhereInput =>
  allOf(videoWhere.notArchived, videoLiveAt(now));

/** Scheduled at `now`: published, but the go-live moment is still ahead. */
export const videoScheduledAt = (now: Date): Prisma.VideoWhereInput => ({
  publishedAt: { gt: now },
});
