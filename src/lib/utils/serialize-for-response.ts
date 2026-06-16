/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/** True for `{}`-style objects only — Date and other class instances are left intact. */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Single-pass deep clone that converts every BigInt it encounters. */
function convertBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') {
    // Numbers outside the safe-integer range lose precision as `number`, so
    // emit them as a decimal string; the client coerces both forms back with
    // `z.coerce.bigint()`.
    return value <= MAX_SAFE && value >= MIN_SAFE ? Number(value) : value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(convertBigInts);
  }

  if (value !== null && typeof value === 'object' && isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = convertBigInts(val);
    }
    return result;
  }

  return value;
}

/**
 * Convert BigInt values so the payload survives JSON serialization. Unlike a
 * `JSON.parse(JSON.stringify(...))` round-trip this walks the value once and
 * leaves `Date` (and other non-plain objects) untouched for the final
 * serializer — `NextResponse.json` on API routes, the RSC boundary on pages —
 * to handle.
 */
export function serializeForResponse<T>(data: T): T {
  return convertBigInts(data) as T;
}
