/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * True when `s3Key` does not sit under the expected per-release/format prefix,
 * or attempts directory traversal. Used to reject spoofed keys before any S3
 * or DB work. Mirrors the prior inline check exactly.
 */
export const isInvalidS3Key = (s3Key: string, expectedPrefix: string): boolean =>
  !s3Key.startsWith(expectedPrefix) || s3Key.includes('..');
