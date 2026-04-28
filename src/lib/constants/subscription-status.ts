/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Subscription statuses that grant the user active subscriber privileges
 * (e.g. label-wide downloads). Mirrors the convention used by the Stripe
 * webhook handlers and `create-checkout-session-action`.
 */
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const;

export type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

/**
 * Returns true when the given status string represents an active subscriber.
 */
export const isActiveSubscriptionStatus = (status: string | null | undefined): boolean =>
  status !== null &&
  status !== undefined &&
  (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
