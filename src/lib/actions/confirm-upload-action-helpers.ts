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

/**
 * True when `error` is a Prisma unique-constraint violation (`P2002`), i.e. a
 * digital format of this type already exists for the release.
 */
export const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

/**
 * Resolve the user-facing message for a thrown confirmation error. Mirrors the
 * prior catch block: a thrown `Error` surfaces its message; anything else
 * surfaces `fallbackMessage`.
 */
export const confirmUploadErrorMessage = (error: unknown, fallbackMessage: string): string =>
  error instanceof Error ? error.message : fallbackMessage;
