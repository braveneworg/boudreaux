/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Download subject (CONTEXT.md): who is downloading — a signed-in user, or a
 * guest identified by the `boudreaux_visitor_id` cookie together with a
 * browser fingerprint. Every download rule is keyed on the subject.
 *
 * A guest may carry `visitorIds`: every visitor id whose downloads count as
 * this guest's (the identity union from guest-identity resolution, when the
 * cookie and the fingerprint resolved to different rows). Readers treat an
 * absent `visitorIds` as `[visitorId]`.
 */
export type DownloadSubject =
  { kind: 'user'; userId: string } | { kind: 'guest'; visitorId: string; visitorIds?: string[] };

/** Every visitor id a guest's downloads are counted under. */
export const guestVisitorIds = (subject: Extract<DownloadSubject, { kind: 'guest' }>): string[] =>
  subject.visitorIds && subject.visitorIds.length > 0 ? subject.visitorIds : [subject.visitorId];

/**
 * Type guard: subject is an authenticated user.
 */
export const isUserSubject = (
  subject: DownloadSubject
): subject is Extract<DownloadSubject, { kind: 'user' }> => subject.kind === 'user';

/**
 * Type guard: subject is an anonymous guest.
 */
export const isGuestSubject = (
  subject: DownloadSubject
): subject is Extract<DownloadSubject, { kind: 'guest' }> => subject.kind === 'guest';
