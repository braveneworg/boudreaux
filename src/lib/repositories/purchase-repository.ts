/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

import { publicArtistWhere } from './_internal/artist-where';
import { digitalFormatWhere } from './_internal/digital-format-where';
import { purchaseWhere } from './_internal/purchase-where';
import { allOf } from './_internal/where-kit';

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
  /**
   * Create a new purchase record after webhook confirms payment. A
   * unique-constraint race surfaces as a vendor-neutral `DataError` (code
   * `DUPLICATE`) for the webhook's idempotency recovery.
   */
  static async create(data: CreatePurchaseData) {
    return prisma.releasePurchase.create({
      data: {
        ...data,
        confirmationEmailSentAt: null,
        refundedAt: null,
      },
    });
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

  /** Find an active (non-refunded) purchase by userId + releaseId composite key. */
  static async findByUserAndRelease(userId: string, releaseId: string) {
    return prisma.releasePurchase.findFirst({
      where: {
        userId,
        releaseId,
        ...purchaseWhere.active,
      },
    });
  }

  /** Get the download tracking record for a user+release pair. */
  static async getDownloadRecord(userId: string, releaseId: string) {
    return prisma.releaseDownload.findUnique({
      where: { userId_releaseId: { userId, releaseId } },
    });
  }

  /**
   * Charge the purchase throttle for one download (ADR-0018). `restart` is
   * true when the gate saw that the idle window had elapsed: the count starts
   * over at one instead of growing past the cap.
   */
  static async recordPurchasedDownload(
    userId: string,
    releaseId: string,
    { restart, now }: { restart: boolean; now: Date }
  ): Promise<void> {
    await prisma.releaseDownload.upsert({
      where: { userId_releaseId: { userId, releaseId } },
      update: restart
        ? { downloadCount: 1, lastDownloadedAt: now }
        : { downloadCount: { increment: 1 }, lastDownloadedAt: now },
      create: { userId, releaseId, downloadCount: 1, lastDownloadedAt: now },
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

  /** Update the Stripe session ID on an existing purchase (e.g. re-purchase of same release). */
  static async updateSessionId(purchaseId: string, sessionId: string) {
    return prisma.releasePurchase.update({
      where: { id: purchaseId },
      data: { stripeSessionId: sessionId },
    });
  }

  /**
   * Reset the confirmation email flag so the email can be retried.
   * Called when SES dispatch fails after the flag was already set.
   */
  static async resetEmailSent(purchaseId: string): Promise<void> {
    await prisma.releasePurchase.updateMany({
      where: { id: purchaseId },
      data: { confirmationEmailSentAt: null },
    });
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
            // Only public artists are named (ADR-0015); a release credited
            // only to hidden artists is listed with no byline.
            artistReleases: {
              where: { artist: { is: publicArtistWhere } },
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
              where: allOf(digitalFormatWhere.active, digitalFormatWhere.hasFiles),
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
              select: { downloadCount: true, lastDownloadedAt: true },
            },
          },
        },
      },
    });
  }

  /**
   * Delete all purchase records for a release (release delete cascade).
   * @returns Count of deleted records
   */
  static async deleteAllByReleaseId(releaseId: string): Promise<number> {
    const result = await prisma.releasePurchase.deleteMany({
      where: { releaseId },
    });
    return result.count;
  }

  /**
   * Delete all download tracking records for a release (release delete cascade).
   * @returns Count of deleted records
   */
  static async deleteAllDownloadsByReleaseId(releaseId: string): Promise<number> {
    const result = await prisma.releaseDownload.deleteMany({
      where: { releaseId },
    });
    return result.count;
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

  /**
   * Mark a purchase as refunded by its Stripe PaymentIntent ID.
   * Uses updateMany filtered to active purchases for idempotency —
   * duplicate webhook deliveries for the same charge are no-ops.
   */
  static async markRefunded(paymentIntentId: string): Promise<boolean> {
    const result = await prisma.releasePurchase.updateMany({
      where: { stripePaymentIntentId: paymentIntentId, ...purchaseWhere.active },
      data: { refundedAt: new Date() },
    });
    return result.count > 0;
  }
}
