/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(
    'Missing required environment variable: STRIPE_SECRET_KEY. Configure it before initializing the Stripe client.',
  );
}

/** Reuse across warm Lambda invocations. */
export const stripe = new Stripe(stripeSecretKey);
