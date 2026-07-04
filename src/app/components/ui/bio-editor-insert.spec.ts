/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { buildBioFigureContent, buildBioLinkContent } from './bio-editor-insert';

describe('buildBioLinkContent', () => {
  it('maps a palette link payload onto bioLink attrs', () => {
    expect(
      buildBioLinkContent({
        label: 'Ceschi on Bandcamp',
        url: 'https://c.bandcamp.com',
        kind: 'streaming',
        isExternal: true,
      })
    ).toEqual({
      type: 'bioLink',
      attrs: { href: 'https://c.bandcamp.com', text: 'Ceschi on Bandcamp', external: true },
    });
  });
});

describe('buildBioFigureContent', () => {
  it('maps a palette image payload onto bioFigure attrs', () => {
    expect(
      buildBioFigureContent({
        url: 'https://cdn/x.jpg',
        thumbnailUrl: null,
        title: 'Live 2018',
        attribution: 'somezine.net',
        alt: 'Ceschi live',
        width: null,
        height: null,
      })
    ).toEqual({
      type: 'bioFigure',
      attrs: {
        src: 'https://cdn/x.jpg',
        alt: 'Ceschi live',
        title: 'Live 2018',
        attribution: 'somezine.net',
      },
    });
  });
});
