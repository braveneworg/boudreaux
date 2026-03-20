/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import Stripe from 'stripe';

const globalForStripe = globalThis as unknown as { stripe: Stripe };

export const stripe =
  globalForStripe.stripe ||
  new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    typescript: true,
  });

if (process.env.NODE_ENV !== 'production') globalForStripe.stripe = stripe;
