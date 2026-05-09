/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Download Subject
 *
 * Discriminated union identifying the entity initiating a digital download.
 * Used to key per-release download counts and freemium quota records for
 * authenticated users (`userId`) and anonymous guests (`visitorId`, sourced
 * from the `boudreaux_visitor_id` HTTP-only cookie).
 *
 * Feature: 007-free-digital-downloads
 */
export type DownloadSubject =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; visitorId: string };

/**
 * Type guard: subject is an authenticated user.
 */
export function isUserSubject(
  subject: DownloadSubject
): subject is Extract<DownloadSubject, { kind: 'user' }> {
  return subject.kind === 'user';
}

/**
 * Type guard: subject is an anonymous guest.
 */
export function isGuestSubject(
  subject: DownloadSubject
): subject is Extract<DownloadSubject, { kind: 'guest' }> {
  return subject.kind === 'guest';
}
