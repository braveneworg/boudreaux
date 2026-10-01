/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { videoLiveAt, videoScheduledAt, videoWhere } from './video-where';
import { isPresent, isUnset } from './where-kit';

describe('videoWhere', () => {
  it('draft and published are the null-safe pair over publishedAt', () => {
    expect(videoWhere.draft).toEqual(isUnset('publishedAt'));
    expect(videoWhere.published).toEqual(isPresent('publishedAt'));
  });

  it('archived and notArchived are the null-safe pair over archivedAt', () => {
    expect(videoWhere.archived).toEqual(isPresent('archivedAt'));
    expect(videoWhere.notArchived).toEqual(isUnset('archivedAt'));
  });

  it('live at now bounds a present publishedAt by now', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(videoLiveAt(now)).toEqual({ publishedAt: { not: null, lte: now } });
  });

  it('scheduled at now is a publishedAt still ahead of now', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(videoScheduledAt(now)).toEqual({ publishedAt: { gt: now } });
  });
});
