/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

interface UpdateSubscriptionData {
  subscriptionId: string;
  subscriptionStatus: string;
  subscriptionTier: string | null;
  subscriptionCurrentPeriodEnd: Date | null;
}

const SUBSCRIPTION_SELECT = {
  id: true,
  email: true,
  stripeCustomerId: true,
  subscriptionId: true,
  subscriptionStatus: true,
  subscriptionTier: true,
  subscriptionCurrentPeriodEnd: true,
  confirmationEmailSentAt: true,
} as const;

export class SubscriptionRepository {
  static async linkStripeCustomer(email: string, stripeCustomerId: string) {
    return prisma.user.update({
      where: { email },
      data: { stripeCustomerId },
    });
  }

  static async updateSubscription(stripeCustomerId: string, data: UpdateSubscriptionData) {
    return prisma.user.update({
      where: { stripeCustomerId },
      data: {
        subscriptionId: data.subscriptionId,
        subscriptionStatus: data.subscriptionStatus,
        subscriptionTier: data.subscriptionTier,
        subscriptionCurrentPeriodEnd: data.subscriptionCurrentPeriodEnd,
      },
    });
  }

  static async cancelSubscription(stripeCustomerId: string) {
    return prisma.user.update({
      where: { stripeCustomerId },
      data: {
        subscriptionStatus: 'canceled',
        subscriptionId: null,
        subscriptionTier: null,
        subscriptionCurrentPeriodEnd: null,
        confirmationEmailSentAt: null,
      },
    });
  }

  static async updateSubscriptionStatus(stripeCustomerId: string, status: string) {
    return prisma.user.update({
      where: { stripeCustomerId },
      data: { subscriptionStatus: status },
    });
  }

  static async findByStripeCustomerId(stripeCustomerId: string) {
    return prisma.user.findUnique({
      where: { stripeCustomerId },
      select: SUBSCRIPTION_SELECT,
    });
  }

  static async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: SUBSCRIPTION_SELECT,
    });
  }

  /**
   * Atomically marks the confirmation email as sent for a user.
   * Uses updateMany with a null-check to prevent race conditions
   * from concurrent page loads.
   *
   * @returns true if the flag was set (email should be sent),
   *          false if it was already set (email already sent).
   */
  static async markConfirmationEmailSent(email: string): Promise<boolean> {
    const result = await prisma.user.updateMany({
      where: { email, confirmationEmailSentAt: null },
      data: { confirmationEmailSentAt: new Date() },
    });

    return result.count > 0;
  }
}
