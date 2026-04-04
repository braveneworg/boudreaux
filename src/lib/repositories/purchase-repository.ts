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

  /** Find a purchase by its Stripe Checkout Session ID (polling key). */
  static async findBySessionId(sessionId: string) {
    return prisma.releasePurchase.findUnique({
      where: { stripeSessionId: sessionId },
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
   * Fetch all purchases for a given user, including release details
   * (title, cover art, images, artists) and download info.
   * Ordered by most recent purchase first.
   */
  static async findAllByUser(userId: string) {
    return prisma.releasePurchase.findMany({
      where: { userId },
      orderBy: { purchasedAt: 'desc' },
      include: {
        release: {
          select: {
            id: true,
            title: true,
            coverArt: true,
            images: true,
            artistReleases: {
              include: {
                artist: {
                  select: {
                    id: true,
                    firstName: true,
                    surname: true,
                    displayName: true,
                  },
                },
              },
            },
            digitalFormats: {
              where: {
                AND: [
                  { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
                  {
                    OR: [
                      { files: { some: {} } },
                      {
                        AND: [{ fileName: { not: null } }, { fileName: { isSet: true } }],
                      },
                    ],
                  },
                ],
              },
              select: {
                formatType: true,
                fileName: true,
                files: {
                  select: { fileName: true },
                  orderBy: { trackNumber: 'asc' },
                  take: 1,
                },
              },
            },
            releaseDownloads: {
              where: { userId },
              select: { downloadCount: true },
            },
          },
        },
      },
    });
  }

  /**
   * Delete a purchase record by its ID. Admin-only operation for testing.
   */
  static async deleteById(purchaseId: string) {
    return prisma.releasePurchase.delete({
      where: { id: purchaseId },
    });
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
}
