/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import path from 'path';

import { SendRawEmailCommand } from '@aws-sdk/client-ses';
import nodemailer from 'nodemailer';

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { sesClient } from '@/lib/utils/ses-client';

import { buildPurchaseConfirmationEmailHtml } from './purchase-confirmation-email-html';
import { buildPurchaseConfirmationEmailText } from './purchase-confirmation-email-text';

interface SendPurchaseConfirmationInput {
  purchaseId: string;
  customerEmail: string;
  releaseTitle: string;
  amountPaidCents: number;
  releaseId: string;
}

/**
 * Sends a purchase confirmation email to the customer.
 *
 * This function is idempotent — concurrent or repeated calls for the same
 * `purchaseId` are deduplicated via the `confirmationEmailSentAt` flag on
 * the ReleasePurchase record.
 *
 * @returns `true` if the email was sent, `false` if it was skipped
 *          (already sent or EMAIL_FROM not configured).
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
  const shouldSend = await PurchaseRepository.markEmailSent(input.purchaseId);
  if (!shouldSend) {
    console.warn(
      `[sendPurchaseConfirmationEmail] Skipped: confirmationEmailSentAt already set for purchase ${input.purchaseId}`
    );
    return false;
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://fakefourrecords.com';
    const downloadUrl = `${baseUrl}/releases/${input.releaseId}`;
    const amountPaid = `$${(input.amountPaidCents / 100).toFixed(2)}`;

    const emailData = {
      email: input.customerEmail,
      releaseTitle: input.releaseTitle,
      amountPaid,
      downloadUrl,
    };

    const logoPath = path.join(process.cwd(), 'public', 'fake-four-inc-black-hand-logo.svg');

    // Use nodemailer to build a multipart/related MIME message so the logo can
    // be embedded as a CID inline attachment. SES SendRawEmailCommand then
    // delivers the pre-built raw message.
    const transport = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });

    const info = await transport.sendMail({
      from: fromAddress,
      to: input.customerEmail,
      subject: `Fake Four Inc. — Download ready: ${input.releaseTitle}`,
      text: buildPurchaseConfirmationEmailText(emailData),
      html: buildPurchaseConfirmationEmailHtml(emailData),
      attachments: [
        {
          filename: 'fake-four-inc-black-hand-logo.svg',
          path: logoPath,
          cid: 'logo@fakefourrecords.com',
          contentType: 'image/svg+xml',
        },
      ],
    });

    const rawMessage = (info as { message: Buffer }).message;

    const command = new SendRawEmailCommand({
      Source: fromAddress,
      Destinations: [input.customerEmail],
      RawMessage: { Data: rawMessage },
    });

    await sesClient.send(command);
    console.info(
      `[sendPurchaseConfirmationEmail] Email sent to ${input.customerEmail} for purchase ${input.purchaseId}`
    );
    return true;
  } catch (error) {
    // SES send failed — reset the flag so a retry (e.g. duplicate webhook
    // delivery) can attempt the email again.
    await PurchaseRepository.resetEmailSent(input.purchaseId);
    console.error(`Failed to send purchase confirmation email to ${input.customerEmail}:`, error);
    return false;
  }
}
