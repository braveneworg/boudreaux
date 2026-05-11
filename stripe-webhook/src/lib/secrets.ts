/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

let cachedSecrets: ResolvedSecrets | null = null;

interface ResolvedSecrets {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  databaseUrl: string;
  webhookIpRanges: string;
}

const REQUIRED_ENV_VARS: Record<keyof ResolvedSecrets, string> = {
  stripeSecretKey: 'STRIPE_SECRET_KEY',
  stripeWebhookSecret: 'STRIPE_WEBHOOK_SECRET',
  databaseUrl: 'DATABASE_URL',
  webhookIpRanges: 'STRIPE_WEBHOOK_IP_RANGES',
};

/**
 * Resolves required secrets from environment variables (injected via the
 * Lambda function configuration from GitHub Actions deploy parameters).
 *
 * Kept async to preserve the prior SSM-based call signature; safe to await
 * once per cold start.
 */
export async function initSecrets(): Promise<ResolvedSecrets> {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const resolved: Partial<ResolvedSecrets> = {};
  for (const [key, envVar] of Object.entries(REQUIRED_ENV_VARS) as Array<
    [keyof ResolvedSecrets, string]
  >) {
    const value = process.env[envVar];
    if (!value) {
      throw new Error(`Missing environment variable: ${envVar}`);
    }
    resolved[key] = value;
  }

  cachedSecrets = resolved as ResolvedSecrets;
  return cachedSecrets;
}

/**
 * Returns the cached secrets. Throws if `initSecrets()` has not been called.
 */
export function getSecrets(): ResolvedSecrets {
  if (!cachedSecrets) {
    throw new Error('Secrets not initialized — call initSecrets() before accessing secrets');
  }
  return cachedSecrets;
}
