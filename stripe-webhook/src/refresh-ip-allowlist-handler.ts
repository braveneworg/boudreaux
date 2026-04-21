/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const STRIPE_WEBHOOK_IPS_URL = 'https://stripe.com/files/ips/ips_webhooks.json';

const ssmClient = new SSMClient({});

interface StripeIpsFile {
  WEBHOOKS: string[];
}

interface RefreshResult {
  changed: boolean;
  count: number;
}

export const handler = async (): Promise<RefreshResult> => {
  const parameterPath = process.env.SSM_PARAMETER_PATH;
  if (!parameterPath) {
    throw new Error('Missing SSM_PARAMETER_PATH environment variable');
  }

  const response = await fetch(STRIPE_WEBHOOK_IPS_URL);
  if (!response.ok) {
    throw new Error(
      `Stripe IPs fetch failed: ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as StripeIpsFile;
  if (!Array.isArray(payload.WEBHOOKS) || payload.WEBHOOKS.length === 0) {
    throw new Error('Stripe IPs payload missing or empty WEBHOOKS array');
  }

  // Sort so reorderings in Stripe's file don't trigger unnecessary writes.
  const next = [...payload.WEBHOOKS].sort().join(',');

  const current = await ssmClient
    .send(new GetParameterCommand({ Name: parameterPath }))
    .then((r) => r.Parameter?.Value ?? '')
    .catch(() => '');

  if (current === next) {
    console.info(`No change (${payload.WEBHOOKS.length} IPs).`);
    return { changed: false, count: payload.WEBHOOKS.length };
  }

  await ssmClient.send(
    new PutParameterCommand({
      Name: parameterPath,
      Value: next,
      Type: 'String',
      Overwrite: true,
    })
  );

  console.info(`Updated ${parameterPath}: ${payload.WEBHOOKS.length} IPs.`);
  return { changed: true, count: payload.WEBHOOKS.length };
};
