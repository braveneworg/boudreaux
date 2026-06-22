/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free mirror of the Prisma `ReleasePurchase` model's
 * scalar fields (no relations loaded). Mirrors `model ReleasePurchase` in
 * prisma/schema.prisma.
 */
export interface PurchaseRecord {
  id: string;
  userId: string;
  releaseId: string;
  amountPaid: number;
  currency: string;
  stripePaymentIntentId: string;
  stripeSessionId: string | null;
  confirmationEmailSentAt: Date | null;
  refundedAt: Date | null;
  purchasedAt: Date;
}
