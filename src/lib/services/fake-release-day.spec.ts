/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { E2E_TODAY_RELEASE_MARKER, FAKE_RELEASE_DAY, fakeReleaseDay } from './fake-release-day';

describe('fakeReleaseDay', () => {
  const now = new Date('2026-10-05T23:30:00.000Z');

  it('answers the fixed day for an ordinary title', () => {
    expect(fakeReleaseDay('Song', now)).toBe(FAKE_RELEASE_DAY);
  });

  it("answers today's UTC day for a title carrying the marker", () => {
    expect(fakeReleaseDay(`Song ${E2E_TODAY_RELEASE_MARKER}`, now)).toBe('2026-10-05');
  });
});
