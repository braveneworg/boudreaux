/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { classifyReferenceKind, deriveLinkLabel } from './link-labels.js';

describe('deriveLinkLabel', () => {
  it('prefers the page title, trimmed and capped at 80 chars', () => {
    expect(
      deriveLinkLabel({
        title: '  Ceschi: the interview  ',
        url: 'https://x.com/a',
        artistName: 'Ceschi',
      })
    ).toBe('Ceschi: the interview');
    const long = 'a'.repeat(120);
    expect(
      deriveLinkLabel({ title: long, url: 'https://x.com/a', artistName: 'Ceschi' }).length
    ).toBe(80);
  });

  it('falls back to "<artist> on <Service>" for known hosts', () => {
    expect(
      deriveLinkLabel({
        title: null,
        url: 'https://ceschi.bandcamp.com/album/x',
        artistName: 'Ceschi',
      })
    ).toBe('Ceschi on Bandcamp');
    expect(
      deriveLinkLabel({
        title: null,
        url: 'https://open.spotify.com/artist/x',
        artistName: 'Ceschi',
      })
    ).toBe('Ceschi on Spotify');
  });

  it('falls back to "<artist> — <hostname>" for unknown hosts', () => {
    expect(
      deriveLinkLabel({
        title: null,
        url: 'https://www.somezine.net/article',
        artistName: 'Ceschi',
      })
    ).toBe('Ceschi — somezine.net');
  });

  it('never returns a bare hostname or empty label on unparseable urls', () => {
    expect(deriveLinkLabel({ title: null, url: 'not a url', artistName: 'Ceschi' })).toBe('Ceschi');
  });
});

describe('classifyReferenceKind', () => {
  it('classifies interview/review/feature/profile/press titles as press', () => {
    for (const title of [
      'An interview with Ceschi',
      'Album review: Broken Bone Ballads',
      'Feature: the rise of Fake Four',
      'Artist profile',
      'Press kit 2024',
    ]) {
      expect(classifyReferenceKind(title)).toBe('press');
    }
  });

  it('classifies everything else (and null) as other', () => {
    expect(classifyReferenceKind('Discography')).toBe('other');
    expect(classifyReferenceKind(null)).toBe('other');
  });
});
