/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Instrumentation } from 'next';

/**
 * Captures uncaught server-side errors (route handlers, Server Components,
 * Server Actions) and writes them to the structured log. The digest field
 * correlates these entries with client error-boundary reports.
 *
 * Request headers are deliberately never logged (cookies/PII).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // This file is compiled for every runtime; winston only loads under Node.js
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { createLogger } = await import('@/lib/utils/logger');

  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : undefined;

  createLogger('UNCAUGHT').error('Unhandled server error', error, {
    ...(digest ? { digest } : {}),
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
  });
};
