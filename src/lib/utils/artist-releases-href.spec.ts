/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistReleasesHref } from './artist-releases-href';

describe('artistReleasesHref', () => {
  it('links to the releases listing filtered by the artist slug', () => {
    expect(artistReleasesHref('marguerite-ash')).toBe('/releases?artist=marguerite-ash');
  });

  it('encodes a slug that is not URL-safe', () => {
    expect(artistReleasesHref('a&b c')).toBe('/releases?artist=a%26b%20c');
  });
});
