/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SendEmailCommand } from '@aws-sdk/client-ses';

import { sesClient } from './ses-client.js';
import { getPrisma } from '../lib/prisma.js';
import { buildPurchaseConfirmationEmailHtml } from './templates/purchase-confirmation-html.js';
import { buildPurchaseConfirmationEmailText } from './templates/purchase-confirmation-text.js';

interface SendPurchaseConfirmationInput {
  purchaseId: string;
  customerEmail: string;
  releaseTitle: string;
  amountPaidCents: number;
  releaseId: string;
}

/**
 * Sends a purchase confirmation email to the customer via SES.
 *
 * Idempotent — concurrent or repeated calls for the same `purchaseId` are
 * deduplicated via the `confirmationEmailSentAt` flag on the ReleasePurchase record.
 *
 * @returns `true` if the email was sent, `false` if it was skipped.
 */
export async function sendPurchaseConfirmationEmail(
  input: SendPurchaseConfirmationInput
): Promise<boolean> {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) {
    console.error('[sendPurchaseConfirmationEmail] EMAIL_FROM is not configured');
    return false;
  }

  // Acquire the idempotency lock — prevents concurrent sends for the same purchase.
  const result = await getPrisma().releasePurchase.updateMany({
    where: { id: input.purchaseId, confirmationEmailSentAt: null },
    data: { confirmationEmailSentAt: new Date() },
  });
  if (result.count === 0) {
    console.warn(
      `[sendPurchaseConfirmationEmail] Skipped: confirmationEmailSentAt already set for purchase ${input.purchaseId}`
    );
    return false;
  }

  try {
    const baseUrl = process.env.BASE_URL ?? 'https://fakefourrecords.com';
    const downloadUrl = `${baseUrl}/releases/${input.releaseId}`;
    const amountPaid = `$${(input.amountPaidCents / 100).toFixed(2)}`;

    const emailData = {
      email: input.customerEmail,
      releaseTitle: input.releaseTitle,
      amountPaid,
      downloadUrl,
    };

    const command = new SendEmailCommand({
      Source: fromAddress,
      Destination: { ToAddresses: [input.customerEmail] },
      Message: {
        Subject: {
          Data: `Fake Four Inc. — Download ready: ${input.releaseTitle}`,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: buildPurchaseConfirmationEmailHtml(emailData),
            Charset: 'UTF-8',
          },
          Text: {
            Data: buildPurchaseConfirmationEmailText(emailData),
            Charset: 'UTF-8',
          },
        },
      },
    });

    await sesClient.send(command);
    console.info(
      `[sendPurchaseConfirmationEmail] Email sent to ${input.customerEmail} for purchase ${input.purchaseId}`
    );
    return true;
  } catch (error) {
    // SES send failed — reset the flag so a retry can attempt the email again.
    await getPrisma().releasePurchase.updateMany({
      where: { id: input.purchaseId },
      data: { confirmationEmailSentAt: null },
    });
    console.error(`Failed to send purchase confirmation email to ${input.customerEmail}:`, error);
    return false;
  }
}
