/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { config } from 'dotenv'; // also load .env as fallback
import Stripe from 'stripe';

config({ path: '.env.local' });
config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

const PRODUCT_NAME = 'Fake Four Inc. Subscription';

interface TierConfig {
  tier: string;
  amount: number;
  envVarName: string;
}

const TIERS: TierConfig[] = [
  { tier: 'minimum', amount: 14.44, envVarName: 'NEXT_PUBLIC_STRIPE_PRICE_MINIMUM' },
  { tier: 'extra', amount: 24.44, envVarName: 'NEXT_PUBLIC_STRIPE_PRICE_EXTRA' },
  { tier: 'extraExtra', amount: 44.44, envVarName: 'NEXT_PUBLIC_STRIPE_PRICE_EXTRA_EXTRA' },
];

async function main() {
  // Create or find the product
  const products = await stripe.products.list({ limit: 100 });
  let product = products.data.find((p) => p.name === PRODUCT_NAME && p.active);

  if (!product) {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: 'Monthly subscription for access to all Fake Four Inc. music',
    });
    console.info(`Created product: ${product.id}`);
  } else {
    console.info(`Found existing product: ${product.id}`);
  }

  // Create prices
  console.info('\nAdd these to your .env file:\n');
  for (const { tier, amount, envVarName } of TIERS) {
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(amount * 100),
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { tier },
    });
    console.info(`${envVarName}="${price.id}"`);
  }
}

main().catch(console.error);
