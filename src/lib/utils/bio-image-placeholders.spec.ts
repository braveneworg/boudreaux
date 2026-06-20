/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { replaceBioImagePlaceholders } from './bio-image-placeholders';

describe('replaceBioImagePlaceholders', () => {
  it('replaces an image:N placeholder with the mapped CDN url', () => {
    const map = new Map([[0, 'https://cdn.example.com/a.jpg']]);

    const result = replaceBioImagePlaceholders('<img src="image:0" alt="x">', map);

    expect(result).toBe('<img src="https://cdn.example.com/a.jpg" alt="x">');
  });

  it('handles single-quoted placeholders', () => {
    const map = new Map([[2, 'https://cdn.example.com/c.jpg']]);

    const result = replaceBioImagePlaceholders("<img src='image:2'>", map);

    expect(result).toContain('https://cdn.example.com/c.jpg');
  });

  it('replaces multiple distinct placeholders', () => {
    const map = new Map([
      [0, 'https://cdn.example.com/a.jpg'],
      [1, 'https://cdn.example.com/b.jpg'],
    ]);

    const result = replaceBioImagePlaceholders(
      '<img src="image:0"><p>mid</p><img src="image:1">',
      map
    );

    expect(result).toContain('https://cdn.example.com/a.jpg');
    expect(result).toContain('https://cdn.example.com/b.jpg');
  });

  it('leaves an unmapped placeholder untouched (sanitizer drops it later)', () => {
    const result = replaceBioImagePlaceholders('<img src="image:9">', new Map());

    expect(result).toBe('<img src="image:9">');
  });

  it('does not touch real image src values', () => {
    const html = '<img src="https://cdn.example.com/real.jpg">';

    const result = replaceBioImagePlaceholders(html, new Map([[0, 'https://x']]));

    expect(result).toBe(html);
  });

  it('returns the html unchanged when there are no placeholders', () => {
    const html = '<p>No images here.</p>';

    expect(replaceBioImagePlaceholders(html, new Map([[0, 'https://x']]))).toBe(html);
  });
});
