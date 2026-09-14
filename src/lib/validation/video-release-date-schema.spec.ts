/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { videoReleaseDateSchema } from './video-release-date-schema';

describe('videoReleaseDateSchema', () => {
  it('accepts a YYYY-MM-DD day', () => {
    expect(videoReleaseDateSchema.safeParse('2020-06-01').success).toBe(true);
  });

  it('accepts an empty string (clears the date)', () => {
    expect(videoReleaseDateSchema.safeParse('').success).toBe(true);
  });

  it('rejects a day that is not on the calendar', () => {
    expect(videoReleaseDateSchema.safeParse('2021-02-30').success).toBe(false);
  });

  it('rejects a slash-formatted date', () => {
    expect(videoReleaseDateSchema.safeParse('06/01/2020').success).toBe(false);
  });

  it('rejects an ISO datetime', () => {
    expect(videoReleaseDateSchema.safeParse('2020-06-01T00:00:00.000Z').success).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(videoReleaseDateSchema.safeParse(20200601).success).toBe(false);
  });
});
