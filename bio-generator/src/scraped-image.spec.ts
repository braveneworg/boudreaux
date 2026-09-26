/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { toScrapedBioImage } from './scraped-image.js';

describe('toScrapedBioImage', () => {
  it('maps a scraped page image onto the BioImage shape with a host attribution', () => {
    expect(
      toScrapedBioImage({
        url: 'https://cdn.press.test/a.jpg',
        alt: 'Band on stage',
        sourceUrl: 'https://www.press.test/kit',
      })
    ).toEqual({
      url: 'https://cdn.press.test/a.jpg',
      thumbnailUrl: null,
      title: 'Band on stage',
      attribution: 'press.test',
      license: null,
      licenseUrl: null,
      sourceUrl: 'https://www.press.test/kit',
      width: null,
      height: null,
      isPrimary: false,
    });
  });

  it("falls back to a 'web' attribution when the source URL cannot be parsed", () => {
    expect(
      toScrapedBioImage({ url: 'https://x/a.jpg', alt: null, sourceUrl: 'nope' })
    ).toMatchObject({
      attribution: 'web',
      title: null,
    });
  });
});
