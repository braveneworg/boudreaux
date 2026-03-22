/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

interface CreatePurchaseData {
  userId: string;
  releaseId: string;
  amountPaid: number;
  currency: string;
  stripePaymentIntentId: string;
  stripeSessionId?: string;
}

/**
 * Data-access layer for ReleasePurchase and ReleaseDownload records.
 * All database logic for the PWYW purchase feature lives here.
 */
export class PurchaseRepository {
  /** Create a new purchase record after webhook confirms payment. */
  static async create(data: CreatePurchaseData) {
    return prisma.releasePurchase.create({ data });
  }

  /** Find a purchase by its Stripe PaymentIntent ID (idempotency key). */
  static async findByPaymentIntentId(paymentIntentId: string) {
    return prisma.releasePurchase.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });
  }

  /** Find a purchase by userId + releaseId composite key. */
  static async findByUserAndRelease(userId: string, releaseId: string) {
    return prisma.releasePurchase.findUnique({
      where: { userId_releaseId: { userId, releaseId } },
    });
  }

  /** Get the download tracking record for a user+release pair. */
  static async getDownloadRecord(userId: string, releaseId: string) {
    return prisma.releaseDownload.findUnique({
      where: { userId_releaseId: { userId, releaseId } },
    });
  }

  /**
   * Atomically increment the download counter for a user+release pair.
   * Upserts the record if it does not yet exist.
   */
  static async upsertDownloadCount(userId: string, releaseId: string) {
    return prisma.releaseDownload.upsert({
      where: { userId_releaseId: { userId, releaseId } },
      update: {
        downloadCount: { increment: 1 },
        lastDownloadedAt: new Date(),
      },
      create: {
        userId,
        releaseId,
        downloadCount: 1,
        lastDownloadedAt: new Date(),
      },
    });
  }

  /**
   * Atomically mark the purchase confirmation email as sent.
   * Uses updateMany with a null-filter to prevent race conditions.
   *
   * @returns `true` if the flag was set (email should be sent now),
   *          `false` if already set (email already dispatched — skip).
   */
  static async markEmailSent(purchaseId: string): Promise<boolean> {
    const result = await prisma.releasePurchase.updateMany({
      where: { id: purchaseId, confirmationEmailSentAt: null },
      data: { confirmationEmailSentAt: new Date() },
    });
    return result.count > 0;
  }

  /**
   * Look up a user by email address to retrieve their ID.
   * Used in the guest-returner flow where only email is available.
   */
  static async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  }

  /**
   * Find an existing user by email or create a minimal guest record.
   * Used by the server action to resolve a stable userId for guests
   * without relying on client-supplied values.
   */
  static async findOrCreateGuestUser(email: string): Promise<{ id: string }> {
    return prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
      select: { id: true },
    });
  }
}
