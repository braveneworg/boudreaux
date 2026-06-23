/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free mirror of the Prisma `BannerNotification` model. The
 * output record is drift-checked against `Prisma.BannerNotificationGetPayload`
 * inside banner-notification-repository, so a schema change that isn't reflected
 * here fails `pnpm run typecheck`.
 */

// =============================================================================
// Output records
// =============================================================================

/**
 * Scalar fields of the Prisma `BannerNotification` model (no relations loaded).
 * Backs the homepage banner carousel and the admin management view.
 */
export interface BannerNotificationRecord {
  id: string;
  slotNumber: number;
  content: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  displayFrom: Date | null;
  displayUntil: Date | null;
  repostedFromId: string | null;
  addedById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Narrow projection returned by the repost-combobox search. */
export interface BannerNotificationSearchRecord {
  id: string;
  content: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  slotNumber: number;
  createdAt: Date;
}

// =============================================================================
// Input types
// =============================================================================

/** Data accepted by the repository to upsert a notification for a slot. */
export interface UpsertBannerNotificationData {
  content?: string | null;
  textColor?: string | null;
  backgroundColor?: string | null;
  displayFrom?: Date | null;
  displayUntil?: Date | null;
  repostedFromId?: string | null;
  addedById: string;
}
