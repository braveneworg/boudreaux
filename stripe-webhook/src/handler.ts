/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as ipaddr from 'ipaddr.js';

import { handleChargeRefunded } from './handlers/charge-refunded.js';
import { handleCheckoutSessionCompleted } from './handlers/checkout-session-completed.js';
import { initSecrets, getSecrets } from './lib/secrets.js';
import { getStripe } from './lib/stripe.js';

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type Stripe from 'stripe';

const parseStripeWebhookIpRanges = (raw: string): string[] => {
  return raw
    .split(',')
    .map((range) => range.trim())
    .filter(Boolean);
};

const shouldSkipStripeIpCheck = (): boolean => {
  return process.env.SKIP_STRIPE_IP_CHECK === 'true';
};

const getSourceIp = (event: APIGatewayProxyEventV2): string | undefined => {
  return event.requestContext.http.sourceIp?.trim() || undefined;
};

const isIpAllowed = (sourceIp: string, allowedRanges: string[]): boolean => {
  if (!ipaddr.isValid(sourceIp)) {
    return false;
  }

  const parsedSourceIp = ipaddr.parse(sourceIp);

  return allowedRanges.some((range) => {
    if (range.includes('/')) {
      try {
        const [parsedRange, prefixLength] = ipaddr.parseCIDR(range);
        return (
          parsedSourceIp.kind() === parsedRange.kind() &&
          parsedSourceIp.match([parsedRange, prefixLength])
        );
      } catch {
        console.warn(`Ignoring invalid STRIPE_WEBHOOK_IP_RANGES entry: ${range}`);
        return false;
      }
    }

    if (!ipaddr.isValid(range)) {
      console.warn(`Ignoring invalid STRIPE_WEBHOOK_IP_RANGES entry: ${range}`);
      return false;
    }

    const parsedAllowedIp = ipaddr.parse(range);
    return (
      parsedSourceIp.kind() === parsedAllowedIp.kind() &&
      parsedSourceIp.toNormalizedString() === parsedAllowedIp.toNormalizedString()
    );
  });
};

/**
 * Enforce the Stripe webhook source-IP allowlist. Returns an HTTP rejection
 * result when the request must be denied, or `null` when it may proceed
 * (either because the check is skipped or the source IP is allowlisted).
 */
const enforceStripeIpAllowlist = (
  event: APIGatewayProxyEventV2,
  webhookIpRanges: string
): APIGatewayProxyResultV2 | null => {
  if (shouldSkipStripeIpCheck()) {
    return null;
  }

  const sourceIp = getSourceIp(event);
  const allowedRanges = parseStripeWebhookIpRanges(webhookIpRanges);

  if (!sourceIp) {
    console.warn('Rejecting Stripe webhook request with missing source IP');
    return { statusCode: 403, body: 'Forbidden' };
  }

  if (allowedRanges.length === 0) {
    console.error('Stripe webhook IP allowlist is empty');
    return { statusCode: 500, body: 'Stripe webhook IP allowlist is not configured' };
  }

  if (!isIpAllowed(sourceIp, allowedRanges)) {
    console.warn(`Rejecting Stripe webhook request from non-allowlisted IP: ${sourceIp}`);
    return { statusCode: 403, body: 'Forbidden' };
  }

  return null;
};

/** Decode the raw webhook body for signature verification (never JSON.parse it). */
const getRawWebhookBody = (event: APIGatewayProxyEventV2): Buffer | string =>
  event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64') : (event.body ?? '');

export const lambdaHandler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  // Cheap early rejection — no secrets fetch needed.
  const signature = event.headers['stripe-signature'];
  if (!signature) {
    return { statusCode: 400, body: 'Missing stripe-signature header' };
  }

  let stripeWebhookSecret: string;
  let webhookIpRanges: string;
  try {
    await initSecrets();
    ({ stripeWebhookSecret, webhookIpRanges } = getSecrets());
  } catch (err) {
    console.error('Failed to initialize Stripe webhook secrets:', err);
    return { statusCode: 500, body: 'Internal server error' };
  }

  const ipRejection = enforceStripeIpAllowlist(event, webhookIpRanges);
  if (ipRejection) {
    return ipRejection;
  }

  const rawBody = getRawWebhookBody(event);

  // Do NOT JSON.parse event.body before passing to constructEvent
  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = getStripe().webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (err) {
    console.error('Stripe signature verification failed:', err);
    return { statusCode: 400, body: 'Webhook signature verification failed' };
  }

  try {
    await handleStripeEvent(stripeEvent);
  } catch (err) {
    console.error(`Unhandled error processing ${stripeEvent.type}:`, err);
    return { statusCode: 500, body: 'Internal server error' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

const handleStripeEvent = async (event: Stripe.Event): Promise<void> => {
  console.info(`Processing Stripe event: ${event.type} [${event.id}]`);

  switch (event.type) {
    case 'checkout.session.completed': {
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case 'charge.refunded': {
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;
    }
    default:
      console.warn(`Unhandled event type: ${event.type}`);
  }
};
