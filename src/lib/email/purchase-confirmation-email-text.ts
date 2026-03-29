/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { PurchaseConfirmationEmailData } from './purchase-confirmation-email-html';

export function buildPurchaseConfirmationEmailText(data: PurchaseConfirmationEmailData): string {
  return `Fake Four Inc. — Purchase Confirmed

Thank you for your purchase!

Release: ${data.releaseTitle}
Amount Paid: ${data.amountPaid}
Account: ${data.email}

Your download is ready. You can download up to 5 times using the link below:
${data.downloadUrl}

Questions? Contact us at support@fakefourinc.com

— Fake Four Inc.
fakefourrecords.com`;
}
