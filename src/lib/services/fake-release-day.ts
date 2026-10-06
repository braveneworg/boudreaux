/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The release day every fake (`BIO_GENERATOR_FAKE`) lookup answers. */
export const FAKE_RELEASE_DAY = '2020-06-01';

/**
 * A video title carrying this marker makes the fake lookups answer today's
 * date, so E2E can exercise the rule that today is never a release date by
 * itself (#743, #810). Fake mode only; the real lookups never read it.
 */
export const E2E_TODAY_RELEASE_MARKER = '[e2e-today]';

/** The release day (YYYY-MM-DD) a fake lookup answers for `title`. */
export const fakeReleaseDay = (title: string, now: Date = new Date()): string =>
  title.includes(E2E_TODAY_RELEASE_MARKER) ? now.toISOString().slice(0, 10) : FAKE_RELEASE_DAY;
