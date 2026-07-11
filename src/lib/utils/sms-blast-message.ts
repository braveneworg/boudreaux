/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Returns the opt-out footer line appended to every blast message.
 * Links to `/profile` where the `allowSmsNotifications` toggle lives.
 */
export const getSmsOptOutLine = (): string =>
  `Opt out: ${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://fakefourrecords.com'}/profile`;

/**
 * Builds the full outgoing SMS body by appending the opt-out profile link
 * after a blank line so recipients can always reach the unsubscribe toggle.
 */
export const buildSmsBlastMessage = (message: string): string =>
  `${message}\n\n${getSmsOptOutLine()}`;
