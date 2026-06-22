/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free mirror of the Prisma `VisitorIdentity` model's
 * scalar fields. Mirrors `model VisitorIdentity` in prisma/schema.prisma.
 */
export interface VisitorIdentityRecord {
  id: string;
  visitorId: string;
  fingerprintHash: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
