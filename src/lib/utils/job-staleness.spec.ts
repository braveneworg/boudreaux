/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isStaleJob } from './job-staleness';

const STALE_MS = 17 * 60 * 1000;

describe('isStaleJob', () => {
  it('treats a job started just now as live', () => {
    expect(isStaleJob(new Date(), STALE_MS)).toBe(false);
  });

  it('treats a job started within the window as live', () => {
    const startedAt = new Date(Date.now() - (STALE_MS - 60_000));

    expect(isStaleJob(startedAt, STALE_MS)).toBe(false);
  });

  it('treats a job older than the window as stale', () => {
    const startedAt = new Date(Date.now() - (STALE_MS + 60_000));

    expect(isStaleJob(startedAt, STALE_MS)).toBe(true);
  });

  it('treats a job exactly at the window boundary as live', () => {
    const startedAt = new Date(Date.now() - STALE_MS);

    expect(isStaleJob(startedAt, STALE_MS)).toBe(false);
  });

  /**
   * The divergence this module exists to remove. Trigger paths used
   * `startedAt?.getTime() ?? 0` (missing start => stale, retry allowed) while
   * status-read paths used `startedAtMs !== undefined` (missing start => alive,
   * UI polls until its deadline). A job with no recorded start cannot be shown
   * to be running, so it must read as stale — failing toward recovery rather
   * than toward a hang.
   */
  it('treats a job with no recorded start as stale', () => {
    expect(isStaleJob(null, STALE_MS)).toBe(true);
  });

  it('treats an undefined start as stale', () => {
    expect(isStaleJob(undefined, STALE_MS)).toBe(true);
  });
});
