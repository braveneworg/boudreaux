/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Generates a MongoDB-compatible ObjectId string client-side.
 *
 * A MongoDB ObjectId is a 24-character hex string. This client-generated ID
 * is used to pre-identify a release before it is saved to the database,
 * enabling S3 uploads to use the final key path (releases/${releaseId}/...)
 * before the release row exists.
 *
 * @returns A 24-character lowercase hex string valid as a MongoDB ObjectId
 */
export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  const randomBytes = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return timestamp + randomBytes;
}
