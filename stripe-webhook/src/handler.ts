/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { handleChargeRefunded } from './handlers/charge-refunded.js';
import { handleCheckoutSessionCompleted } from './handlers/checkout-session-completed.js';
import { handleInvoicePaymentFailed } from './handlers/invoice-payment-failed.js';
import { handleSubscriptionDeleted } from './handlers/subscription-deleted.js';
import { handleSubscriptionUpdated } from './handlers/subscription-updated.js';
import { stripe } from './lib/stripe.js';

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type Stripe from 'stripe';

export const lambdaHandler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const signature = event.headers['stripe-signature'];
  if (!signature) {
    return { statusCode: 400, body: 'Missing stripe-signature header' };
  }

  const rawBody =
    event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64')
      : (event.body ?? '');

  // Do NOT JSON.parse event.body before passing to constructEvent
  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Stripe signature verification failed:', err);
    return { statusCode: 400, body: 'Webhook signature verification failed' };
  }

  try {
    await handleStripeEvent(stripeEvent);
  } catch (err) {
    // Return 200 anyway — prevents Stripe from retrying a broken handler.
    // Fix the bug, then manually retry from the Stripe dashboard.
    console.error(`Unhandled error processing ${stripeEvent.type}:`, err);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  console.info(`Processing Stripe event: ${event.type} [${event.id}]`);

  switch (event.type) {
    case 'checkout.session.completed': {
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case 'customer.subscription.updated': {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    }
    case 'invoice.payment_failed': {
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    }
    case 'charge.refunded': {
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;
    }
    default:
      console.warn(`Unhandled event type: ${event.type}`);
  }
}
