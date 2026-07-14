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

/**
 * Bio-generation progress channel (server-to-server) — 60 requests per minute.
 * A single run POSTs one checkpoint per stage (~11 stages), so the higher cap
 * absorbs the stage cadence plus Lambda retries while still blunting a flood of
 * forged progress POSTs. Verify-only — it never claims the job token.
 */
export const bioProgressLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const BIO_PROGRESS_LIMIT = 60;

/** Link-preview unfurl (admin bio editor) — 30 requests per minute. */
export const linkPreviewLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const LINK_PREVIEW_LIMIT = 30;

/**
 * Video-enrichment completion callback (server-to-server) — 20 requests per
 * minute. One legitimate POST per dispatched job; the modest cap absorbs
 * Lambda retries while blunting a flood of forged completion callbacks.
 */
export const videoEnrichmentCallbackLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const VIDEO_ENRICHMENT_CALLBACK_LIMIT = 20;

/**
 * Video-enrichment progress channel (server-to-server) — 60 requests per
 * minute. A run POSTs one checkpoint per stage (5 stages), so the higher cap
 * absorbs the cadence plus Lambda retries. Verify-only — it never claims the
 * job token.
 */
export const videoEnrichmentProgressLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const VIDEO_ENRICHMENT_PROGRESS_LIMIT = 60;

/**
 * Video probe prefill (admin video form) — 10 requests per minute.
 * ffprobe spawns a child process per call, making this endpoint expensive;
 * the low cap prevents accidental or deliberate process storms.
 */
export const videoProbePrefillLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const VIDEO_PROBE_PREFILL_LIMIT = 10;
