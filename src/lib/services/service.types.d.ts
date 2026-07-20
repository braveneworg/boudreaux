/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { DataErrorCode } from '@/lib/types/domain/errors';

/**
 * The result of a service call.
 *
 * The failure arm carries both a user-facing `error` message and the
 * vendor-neutral {@link DataErrorCode} it originated from. The two are
 * independent on purpose: `error` is copy and may be overridden per call site,
 * while `code` is the stable fact callers branch on (HTTP status, retry
 * policy, telemetry). Never re-derive a code by matching on `error` — the copy
 * is free to change and matching it silently couples behaviour to wording.
 */
export type ServiceResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: DataErrorCode };
