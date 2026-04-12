/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { rateLimit } from '@/lib/utils/rate-limit';

/** Standard public endpoints — 30 requests per minute */
export const publicLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const PUBLIC_LIMIT = 30;

/** Search endpoints — 15 requests per minute */
export const searchLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const SEARCH_LIMIT = 15;

/** Health endpoint — 10 requests per minute */
export const healthLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const HEALTH_LIMIT = 10;

/** Download endpoints — 10 requests per minute */
export const downloadLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const DOWNLOAD_LIMIT = 10;

/** Polling endpoints — 20 requests per minute */
export const pollingLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const POLLING_LIMIT = 20;
