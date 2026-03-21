/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { SendEmailCommand } from '@aws-sdk/client-ses';

import { SubscriptionRepository } from '@/lib/repositories/subscription-repository';
import { getSubscriberRate, TIER_LABELS, type SubscriberRateTier } from '@/lib/subscriber-rates';
import { sesClient } from '@/lib/utils/ses-client';

import { buildSubscriptionConfirmationEmailHtml } from './subscription-confirmation-email-html';
import { buildSubscriptionConfirmationEmailText } from './subscription-confirmation-email-text';

/**
 * Sends a subscription confirmation email to the customer.
 *
 * This function is idempotent — concurrent or repeated calls for the same
 * email address are deduplicated via the `confirmationEmailSentAt` flag.
 *
 * @returns `true` if the email was sent, `false` if it was skipped
 *          (already sent or EMAIL_FROM not configured).
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

  const shouldSend = await SubscriptionRepository.markConfirmationEmailSent(customerEmail);
  if (!shouldSend) {
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
    await SubscriptionRepository.resetConfirmationEmailSent(customerEmail);
    return false;
  }
}
