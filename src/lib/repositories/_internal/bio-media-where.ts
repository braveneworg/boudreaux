/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isUnsetOr } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Bio-media `where` fragments, shared by `ArtistBioImage` and `ArtistBioLink`.
 * Both carry `origin` — `generated` (owned by the bio job) or `custom` (owned
 * by a human, kept through regeneration; ADR-0008) — and rows written before
 * the field existed have it null or absent, which regeneration treats as
 * generated. Proved by `bio-media-where.contract.spec.ts`.
 */
export const bioMediaWhere = {
  /** Owned by a human: survives regeneration. */
  custom: { origin: 'custom' },
  /** Owned by the bio job, or legacy (null or absent): regeneration replaces it. */
  generatedOrLegacy: isUnsetOr('origin', 'generated'),
} as const satisfies Record<
  string,
  Prisma.ArtistBioImageWhereInput & Prisma.ArtistBioLinkWhereInput
>;

/**
 * Bio-image `where` fragments. Proved by
 * `bio-image-display-where.contract.spec.ts`.
 */
export const bioImageWhere = {
  /**
   * The rows display-image resolution can pick from: a human's chosen row
   * (`displayOrder: { gte: 0 }` matches only numbers — null and absent both
   * fail) or the job's suggested row. No DB-level take belongs beside it:
   * Mongo sorts nulls first, so a cap would return unchosen rows; the service
   * resolves and caps after the read (`resolveDisplayImages`).
   */
  displayCandidate: { OR: [{ displayOrder: { gte: 0 } }, { isPrimary: true }] },
} as const satisfies Record<string, Prisma.ArtistBioImageWhereInput>;

/**
 * Bio-link `where` fragments. A link plays the **reference** role unless it
 * explicitly opted out (`reference: false`, an image-source-only row); legacy
 * rows have the field null or absent and read as reference links.
 */
export const bioLinkWhere = {
  reference: isUnsetOr('reference', true),
} as const satisfies Record<string, Prisma.ArtistBioLinkWhereInput>;
