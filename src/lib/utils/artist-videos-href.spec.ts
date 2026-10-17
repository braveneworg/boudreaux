/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistVideosHref } from './artist-videos-href';

describe('artistVideosHref', () => {
  it('links to the videos listing filtered by the artist slug', () => {
    expect(artistVideosHref('marguerite-ash')).toBe('/videos?artist=marguerite-ash');
  });

  it('encodes a slug that is not URL-safe', () => {
    expect(artistVideosHref('a&b c')).toBe('/videos?artist=a%26b%20c');
  });
});
