/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Stripe from 'stripe';

/** Reuse across warm Lambda invocations. */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
