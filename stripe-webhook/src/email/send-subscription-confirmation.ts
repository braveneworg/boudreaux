/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SendEmailCommand } from '@aws-sdk/client-ses';

import { sesClient } from './ses-client.js';
import { prisma } from '../lib/prisma.js';
import { getSubscriberRate, TIER_LABELS } from '../lib/subscriber-rates.js';
import { buildSubscriptionConfirmationEmailHtml } from './templates/subscription-confirmation-html.js';
import { buildSubscriptionConfirmationEmailText } from './templates/subscription-confirmation-text.js';

import type { SubscriberRateTier } from '../lib/subscriber-rates.js';

/**
 * Sends a subscription confirmation email to the customer via SES.
 *
 * Idempotent — concurrent or repeated calls for the same email are
 * deduplicated via the `confirmationEmailSentAt` flag on the User record.
 *
 * @returns `true` if the email was sent, `false` if it was skipped.
 */
export async function sendSubscriptionConfirmationEmail(
  customerEmail: string,
  tier: SubscriberRateTier | null,
  interval: string
): Promise<boolean> {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) {
    console.error('EMAIL_FROM is not configured; skipping subscription confirmation email');
    return false;
  }

  // Acquire the idempotency lock.
  const result = await prisma.user.updateMany({
    where: { email: customerEmail, confirmationEmailSentAt: null },
    data: { confirmationEmailSentAt: new Date() },
  });
  if (result.count === 0) {
    return false;
  }

  try {
    const tierLabel = tier ? TIER_LABELS[tier] : 'Subscriber';
    const amount = tier ? `$${getSubscriberRate(tier).toFixed(2)}` : '';

    const emailData = { email: customerEmail, tierLabel, amount, interval };

    const command = new SendEmailCommand({
      Source: fromAddress,
      Destination: { ToAddresses: [customerEmail] },
      Message: {
        Subject: {
          Data: 'Welcome to Fake Four Inc. — Subscription Confirmed',
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: buildSubscriptionConfirmationEmailHtml(emailData),
            Charset: 'UTF-8',
          },
          Text: {
            Data: buildSubscriptionConfirmationEmailText(emailData),
            Charset: 'UTF-8',
          },
        },
      },
    });

    await sesClient.send(command);
    return true;
  } catch (error) {
    console.error(`Failed to send subscription confirmation email to ${customerEmail}:`, error);
    await prisma.user.updateMany({
      where: { email: customerEmail },
      data: { confirmationEmailSentAt: null },
    });
    return false;
  }
}
