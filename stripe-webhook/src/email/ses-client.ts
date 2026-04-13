/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SESClient } from '@aws-sdk/client-ses';

/** Reuse across warm Lambda invocations. */
export const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION || 'us-east-1',
});
