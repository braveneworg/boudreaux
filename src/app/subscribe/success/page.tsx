/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { after } from 'next/server';

import { SendEmailCommand } from '@aws-sdk/client-ses';

import { buildSubscriptionConfirmationEmailHtml } from '@/lib/email/subscription-confirmation-email-html';
import { buildSubscriptionConfirmationEmailText } from '@/lib/email/subscription-confirmation-email-text';
import { stripe } from '@/lib/stripe';
import { getSubscriberRate, getTierByPriceId, TIER_LABELS } from '@/lib/subscriber-rates';
import { sesClient } from '@/lib/utils/ses-client';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Subscription Confirmed | Fake Four Inc.',
  description: 'Thank you for subscribing to the Fake Four Inc. record label.',
};

interface SubscribeSuccessPageProps {
  searchParams: Promise<{ session_id?: string }>;
}

const SubscribeSuccessPage = async ({ searchParams }: SubscribeSuccessPageProps) => {
  const { session_id } = await searchParams;

  if (!session_id) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Subscribe</h1>
        <p className="text-muted-foreground mt-4 text-lg">
          It looks like you arrived here without completing checkout.
        </p>
      </div>
    );
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);

    if (checkoutSession.payment_status === 'paid') {
      const customerEmail = checkoutSession.customer_details?.email;

      if (customerEmail) {
        after(sendConfirmationEmail(checkoutSession, customerEmail));
      }

      return (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to the Family!</h1>
          <p className="text-muted-foreground mt-4 text-lg">
            Thank you for subscribing! You now have access to all music on the Fake Four Inc. record
            label.
          </p>
          {customerEmail && (
            <p className="text-muted-foreground mt-2 text-sm">
              A confirmation email will be sent to {customerEmail}.
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Processing Your Subscription</h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Your payment is being processed. You will receive a confirmation email shortly.
        </p>
      </div>
    );
  } catch {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Something Went Wrong</h1>
        <p className="text-muted-foreground mt-4 text-lg">
          We could not verify your subscription. Please contact support if you believe this is an
          error.
        </p>
      </div>
    );
  }
};

async function sendConfirmationEmail(
  checkoutSession: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>,
  customerEmail: string
) {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) {
    console.error('EMAIL_FROM is not configured; skipping subscription confirmation email');
    return;
  }

  try {
    let tierLabel = 'Subscriber';
    let amount = '';
    let interval = 'month';

    if (checkoutSession.subscription) {
      const subscriptionId =
        typeof checkoutSession.subscription === 'string'
          ? checkoutSession.subscription
          : checkoutSession.subscription.id;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      const tier = priceId ? getTierByPriceId(priceId) : null;

      if (tier) {
        tierLabel = TIER_LABELS[tier];
        amount = `$${getSubscriberRate(tier).toFixed(2)}`;
      }

      interval = subscription.items.data[0]?.price.recurring?.interval ?? 'month';
    }

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
  } catch (error) {
    console.error('Failed to send subscription confirmation email:', error);
  }
}

export default SubscribeSuccessPage;
