/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/constants/subscription-status';
import { prisma } from '@/lib/prisma';

import type Stripe from 'stripe';

interface UpdateSubscriptionData {
  subscriptionId: string;
  subscriptionStatus: Stripe.Subscription.Status;
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
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId },
      select: { id: true },
    });

    if (!user) {
      throw new Error(`No user found with stripeCustomerId: ${stripeCustomerId}`);
    }

    return prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionId: data.subscriptionId,
        subscriptionStatus: data.subscriptionStatus,
        subscriptionTier: data.subscriptionTier,
        subscriptionCurrentPeriodEnd: data.subscriptionCurrentPeriodEnd,
      },
    });
  }

  static async cancelSubscription(stripeCustomerId: string) {
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId },
      select: { id: true },
    });

    if (!user) {
      throw new Error(`No user found with stripeCustomerId: ${stripeCustomerId}`);
    }

    return prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: 'canceled',
        subscriptionId: null,
        subscriptionTier: null,
        subscriptionCurrentPeriodEnd: null,
        confirmationEmailSentAt: null,
      },
    });
  }

  static async updateSubscriptionStatus(
    stripeCustomerId: string,
    status: Stripe.Subscription.Status
  ) {
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId },
      select: { id: true },
    });

    if (!user) {
      throw new Error(`No user found with stripeCustomerId: ${stripeCustomerId}`);
    }

    return prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: status },
    });
  }

  static async findByStripeCustomerId(stripeCustomerId: string) {
    return prisma.user.findFirst({
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
   * Returns true when the user currently holds an active subscription
   * (status `active` or `trialing`). Used to gate label-wide download
   * privileges granted to subscribers.
   */
  static async hasActiveSubscription(userId: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        subscriptionStatus: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
      },
      select: { id: true },
    });

    return user !== null;
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

  /**
   * Resets the confirmation email sent flag for a user so that a
   * failed send attempt can be retried on the next webhook delivery.
   */
  static async resetConfirmationEmailSent(email: string): Promise<void> {
    await prisma.user.updateMany({
      where: { email },
      data: { confirmationEmailSentAt: null },
    });
  }
}
