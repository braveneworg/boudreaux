/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { SubscriptionRepository } from '@/lib/repositories/subscription-repository';
import { stripe } from '@/lib/stripe';
import { getTierByPriceId } from '@/lib/subscriber-rates';

import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error(
      'Webhook signature verification failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(`Error handling webhook event ${event.type}:`, error);
    return NextResponse.json({ received: true, error: 'Handler failed' }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const customerEmail = session.customer_details?.email ?? session.customer_email;
  const stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id;

  if (!customerEmail || !stripeCustomerId) {
    console.error('checkout.session.completed missing email or customer ID', {
      sessionId: session.id,
    });
    return;
  }

  await SubscriptionRepository.linkStripeCustomer(customerEmail, stripeCustomerId);

  if (session.subscription) {
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0]?.price.id;
    const tier = priceId ? getTierByPriceId(priceId) : null;

    await SubscriptionRepository.updateSubscription(stripeCustomerId, {
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionTier: tier,
      subscriptionCurrentPeriodEnd: new Date(subscription.items.data[0].current_period_end * 1000),
    });
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const priceId = subscription.items.data[0]?.price.id;
  const tier = priceId ? getTierByPriceId(priceId) : null;

  await SubscriptionRepository.updateSubscription(stripeCustomerId, {
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionTier: tier,
    subscriptionCurrentPeriodEnd: new Date(subscription.items.data[0].current_period_end * 1000),
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  await SubscriptionRepository.cancelSubscription(stripeCustomerId);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripeCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!stripeCustomerId) {
    console.error('invoice.payment_failed missing customer ID', { invoiceId: invoice.id });
    return;
  }

  await SubscriptionRepository.updateSubscriptionStatus(stripeCustomerId, 'past_due');
}
