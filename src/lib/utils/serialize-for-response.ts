/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Convert BigInt values to Number so the payload survives JSON serialization. */
export function serializeForResponse<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, v: unknown) => (typeof v === 'bigint' ? Number(v) : v))
  ) as T;
}
