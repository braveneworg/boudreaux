/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import Stripe from 'stripe';

const globalForStripe = globalThis as unknown as { stripe: Stripe };

/**
 * Lazily-initialized Stripe client.
 * Uses a getter so that `STRIPE_SECRET_KEY` is read at runtime, not at
 * build time — Next.js collects page data during `next build` and the
 * secret is only available at runtime.
 */
function getStripe(): Stripe {
  if (globalForStripe.stripe) return globalForStripe.stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }

  const client = new Stripe(key, { typescript: true });

  if (process.env.NODE_ENV !== 'production') {
    globalForStripe.stripe = client;
  }

  return client;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = getStripe();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
