/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SubscriptionConfirmationEmailData } from '@/lib/email/subscription-confirmation-email-html';

export function buildSubscriptionConfirmationEmailText(
  data: SubscriptionConfirmationEmailData
): string {
  return `SUBSCRIPTION CONFIRMED
======================

Welcome to the Family!

Thank you for subscribing. You now have access to all music on the Fake Four Inc. record label.

Plan: ${data.tierLabel}
Amount: ${data.amount}/${data.interval}
Account: ${data.email}

Head over to fakefourrecords.com to start listening and downloading.

----------------------
Fake Four Inc. — fakefourrecords.com`;
}
