/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context propagated via AsyncLocalStorage so every log line
 * emitted while serving a request carries the same requestId — in production
 * the id comes from nginx ($request_id, also written to the access log and
 * returned in the X-Request-Id response header), which lets one LogQL query
 * reconstruct a request across nginx and every app layer.
 */

interface RequestContext {
  requestId: string;
}

// Stored on globalThis (same pattern as the logger registry) so the context
// is shared even if the bundler duplicates this module across chunks.
const globalForRequestContext = globalThis as unknown as {
  boudreauxRequestContext?: AsyncLocalStorage<RequestContext>;
};

const storage = (globalForRequestContext.boudreauxRequestContext ??=
  new AsyncLocalStorage<RequestContext>());

/** nginx emits 32 hex chars; anything else client-supplied is replaced */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Resolve the request id for an incoming request: trust the proxy-supplied
 * x-request-id header when well-formed, otherwise mint a UUID (direct dev
 * access, or a client trying to inject log content).
 */
export const resolveRequestId = (headers: Headers): string => {
  const fromHeader = headers.get('x-request-id')?.trim();
  if (fromHeader && REQUEST_ID_PATTERN.test(fromHeader)) {
    return fromHeader;
  }
  return crypto.randomUUID();
};

/**
 * Run `fn` with the given requestId in scope. If a context is already
 * active (outer decorator already established one), it is reused so nested
 * decorators never overwrite the outermost id.
 */
export const runWithRequestContext = <T>(requestId: string, fn: () => T): T => {
  if (storage.getStore() !== undefined) {
    return fn();
  }
  return storage.run({ requestId }, fn);
};

/** The active request id, or undefined outside a request scope */
export const getRequestId = (): string | undefined => {
  return storage.getStore()?.requestId;
};
