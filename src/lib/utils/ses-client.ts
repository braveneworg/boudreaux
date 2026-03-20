/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { SESClient } from '@aws-sdk/client-ses';

function getSesClient(): SESClient {
  return new SESClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

/**
 * Lazily initialized SES client.
 * Uses a Proxy to defer instantiation until first use so that
 * `next build` page-data collection does not trigger the AWS SDK
 * credential resolver at build time.
 */
export const sesClient = new Proxy({} as SESClient, {
  get(_target, prop, receiver) {
    const client = getSesClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
