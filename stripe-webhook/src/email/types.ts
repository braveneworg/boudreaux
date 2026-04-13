/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export interface PurchaseConfirmationEmailData {
  email: string;
  releaseTitle: string;
  amountPaid: string;
  downloadUrl: string;
}

export interface SubscriptionConfirmationEmailData {
  email: string;
  tierLabel: string;
  amount: string;
  interval: string;
}
