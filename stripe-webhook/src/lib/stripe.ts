/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Stripe from 'stripe';

import { getSecrets } from './secrets.js';

/** Reuse across warm Lambda invocations. */
let stripeClient: Stripe | null = null;

/**
 * Returns the Stripe client, creating it lazily on first call.
 * Requires `initSecrets()` to have been called beforehand.
 */
export function getStripe(): Stripe {
  if (!stripeClient) {
    const { stripeSecretKey } = getSecrets();
    stripeClient = new Stripe(stripeSecretKey);
  }
  return stripeClient;
}
