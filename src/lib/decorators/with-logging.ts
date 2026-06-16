/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';

import { extractClientIp } from '@/lib/utils/extract-client-ip';
import { createLogger, shouldSample } from '@/lib/utils/logger';
import { resolveRequestId, runWithRequestContext } from '@/lib/utils/request-context';

type LoggedHandler<TParams = unknown> = (
  request: NextRequest,
  context: { params: Promise<TParams> }
) => Promise<NextResponse> | NextResponse;

/** 2xx responses are sampled 1-in-N to keep log volume modest under load */
const SUCCESS_SAMPLE_RATE = 20;

const requestMeta = (
  request: NextRequest,
  startMs: number,
  status?: number
): Record<string, unknown> => ({
  path: request.nextUrl.pathname,
  method: request.method,
  ip: extractClientIp(request),
  durationMs: Math.round(performance.now() - startMs),
  ...(status !== undefined && { status }),
});

/**
 * Wraps an API route handler with structured outcome logging:
 * 5xx → error, 4xx → warn, success → sampled info, thrown → error + rethrow
 * (the rethrown error also reaches `onRequestError`; the digest correlates).
 *
 * Compose outside other decorators so it observes their responses too:
 * `export const GET = withLogging('RELEASES')(withAuth(handler))`
 */
export const withLogging = <TParams = unknown>(moduleName: string) => {
  const logger = createLogger(moduleName);

  return (handler: LoggedHandler<TParams>): LoggedHandler<TParams> => {
    return async (request, context) =>
      runWithRequestContext(resolveRequestId(request.headers), async () => {
        const start = performance.now();

        try {
          const response = await handler(request, context);

          if (response.status >= 500) {
            logger.error('Request failed', undefined, requestMeta(request, start, response.status));
          } else if (response.status >= 400) {
            logger.warn('Request rejected', requestMeta(request, start, response.status));
          } else if (shouldSample(`${moduleName}.request.ok`, SUCCESS_SAMPLE_RATE)) {
            logger.info('Request ok', requestMeta(request, start, response.status));
          }

          return response;
        } catch (error) {
          logger.error('Unhandled route error', error, requestMeta(request, start));
          throw error;
        }
      });
  };
};

interface ActionLogContext {
  /** Acting user, when known */
  userId?: string;
  /** Additional structured data (redacted by the logger) */
  data?: Record<string, unknown>;
}

/**
 * Wraps a Server Action body with outcome + duration logging. Failures
 * (thrown errors) are logged and rethrown; result objects are not
 * interpreted — actions that return `{ success: false }` should log
 * domain-specific warnings themselves.
 *
 * @example
 * return logAction('PAYMENTS', 'createCheckoutSession', { userId }, async () => {
 *   ...
 * });
 */
export const logAction = async <TResult>(
  moduleName: string,
  actionName: string,
  context: ActionLogContext,
  action: () => Promise<TResult>
): Promise<TResult> => {
  const logger = createLogger(moduleName);

  // Server Actions have no Request to read a proxy header from — mint an id
  // (runWithRequestContext reuses any context already established upstream).
  return runWithRequestContext(crypto.randomUUID(), async () => {
    const start = performance.now();

    try {
      const result = await action();

      if (shouldSample(`${moduleName}.${actionName}.ok`, SUCCESS_SAMPLE_RATE)) {
        logger.info(`Action completed: ${actionName}`, {
          action: actionName,
          durationMs: Math.round(performance.now() - start),
          ...(context.userId !== undefined && { userId: context.userId }),
          ...context.data,
        });
      }

      return result;
    } catch (error) {
      logger.error(`Action failed: ${actionName}`, error, {
        action: actionName,
        durationMs: Math.round(performance.now() - start),
        ...(context.userId !== undefined && { userId: context.userId }),
        ...context.data,
      });
      throw error;
    }
  });
};
