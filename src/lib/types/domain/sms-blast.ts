/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free mirror of the Prisma `SmsBlast` model. The output
 * record is drift-checked against `Prisma.SmsBlastGetPayload` inside
 * sms-blast-repository, so a schema change that isn't reflected here fails
 * `pnpm run typecheck`.
 */

// =============================================================================
// Output records
// =============================================================================

/**
 * Scalar fields of the Prisma `SmsBlast` model. Backs the admin announcements
 * history view. Sender identity is denormalized so rows survive sender deletion.
 */
export interface SmsBlastRecord {
  id: string;
  message: string;
  sentById: string;
  sentByEmail: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: Date;
}

// =============================================================================
// Input types
// =============================================================================

/** Data accepted by the repository to create an SMS blast history row. */
export interface CreateSmsBlastData {
  message: string;
  sentById: string;
  sentByEmail: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}
