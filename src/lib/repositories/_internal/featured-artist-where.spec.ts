/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { featuredArtistWhere, featuredWindowAt } from './featured-artist-where';
import { isPresent, isUnset } from './where-kit';

describe('featuredArtistWhere', () => {
  it('published and unpublished are the null-safe pair over publishedOn', () => {
    expect(featuredArtistWhere.published).toEqual(isPresent('publishedOn'));
    expect(featuredArtistWhere.unpublished).toEqual(isUnset('publishedOn'));
  });

  it('the window at now bounds featuredOn by now and lets featuredUntil be open or ahead', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(featuredWindowAt(now)).toEqual({
      featuredOn: { lte: now },
      OR: [
        { featuredUntil: null },
        { featuredUntil: { isSet: false } },
        { featuredUntil: { gte: now } },
      ],
    });
  });
});
