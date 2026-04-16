/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});

/** Cached secret values — populated once per cold start, reused across warm invocations. */
let cachedSecrets: ResolvedSecrets | null = null;

interface ResolvedSecrets {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  databaseUrl: string;
}

/**
 * SSM parameter paths are passed as non-secret environment variables so that
 * the infrastructure definition (template.yaml) remains the single source of
 * truth for parameter names.
 */
const SSM_PATH_ENV_VARS = {
  stripeSecretKey: 'SSM_PATH_STRIPE_SECRET_KEY',
  stripeWebhookSecret: 'SSM_PATH_STRIPE_WEBHOOK_SECRET',
  databaseUrl: 'SSM_PATH_DATABASE_URL',
} as const;

async function fetchSsmParameter(path: string): Promise<string> {
  const command = new GetParameterCommand({
    Name: path,
    WithDecryption: true,
  });

  const result = await ssmClient.send(command);
  const value = result.Parameter?.Value;

  if (!value) {
    throw new Error(`SSM parameter ${path} returned no value`);
  }

  return value;
}

/**
 * Fetches all secrets from SSM Parameter Store and caches them for the
 * lifetime of the Lambda execution environment (warm invocations).
 *
 * Must be called once at the start of each cold-start invocation before
 * any Stripe or Prisma client is used.
 */
export async function initSecrets(): Promise<ResolvedSecrets> {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const paths: Record<keyof ResolvedSecrets, string> = {
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    databaseUrl: '',
  };

  for (const [key, envVar] of Object.entries(SSM_PATH_ENV_VARS)) {
    const path = process.env[envVar];
    if (!path) {
      throw new Error(`Missing environment variable: ${envVar}`);
    }
    paths[key as keyof ResolvedSecrets] = path;
  }

  const [stripeSecretKey, stripeWebhookSecret, databaseUrl] = await Promise.all([
    fetchSsmParameter(paths.stripeSecretKey),
    fetchSsmParameter(paths.stripeWebhookSecret),
    fetchSsmParameter(paths.databaseUrl),
  ]);

  // Set DATABASE_URL in process.env so PrismaClient picks it up automatically.
  process.env.DATABASE_URL = databaseUrl;

  cachedSecrets = { stripeSecretKey, stripeWebhookSecret, databaseUrl };
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
