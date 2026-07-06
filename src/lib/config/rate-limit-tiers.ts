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

/** Client error reports — 5 requests per minute */
export const clientErrorLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const CLIENT_ERROR_LIMIT = 5;

/**
 * Bio-generation completion callback (server-to-server) — 20 requests per minute.
 * One legitimate POST per dispatched job; the modest cap absorbs Lambda retries
 * while blunting a flood of forged completion callbacks.
 */
export const bioCallbackLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const BIO_CALLBACK_LIMIT = 20;

/** Link-preview unfurl (admin bio editor) — 30 requests per minute. */
export const linkPreviewLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const LINK_PREVIEW_LIMIT = 30;
