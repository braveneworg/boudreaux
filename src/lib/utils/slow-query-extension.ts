/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Prisma } from '@prisma/client';

import { loggers } from './logger';

/**
 * App-side query timing for the Prisma client. Operations slower than the
 * threshold log a structured warning with model/operation/duration — never
 * the query arguments (no PII, no query content). Adds zero load to the
 * database, which matters on the Atlas M0 free tier: when Atlas throttles
 * under load, these warnings are the visible symptom.
 */

const DEFAULT_SLOW_QUERY_MS = 200;

/** Threshold from SLOW_QUERY_MS (positive integer), else 200ms */
export const resolveSlowQueryThresholdMs = (): number => {
  const raw = process.env.SLOW_QUERY_MS;
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLOW_QUERY_MS;
};

export const createSlowQueryExtension = (thresholdMs: number = resolveSlowQueryThresholdMs()) =>
  Prisma.defineExtension({
    name: 'slow-query-logging',
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        const start = performance.now();
        try {
          return await query(args);
        } finally {
          const durationMs = Math.round(performance.now() - start);
          if (durationMs >= thresholdMs) {
            loggers.database.warn('Slow query', {
              ...(model !== undefined && { model }),
              operation,
              durationMs,
              thresholdMs,
            });
          }
        }
      },
    },
  });
