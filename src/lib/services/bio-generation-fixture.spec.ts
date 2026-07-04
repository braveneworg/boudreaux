/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fakeBioGeneration } from './bio-generation-fixture';

describe('fakeBioGeneration', () => {
  it('returns a successful result', () => {
    const result = fakeBioGeneration({ artistId: 'a', displayName: 'Test Artist' });
    expect(result.ok).toBe(true);
  });

  it('echoes the display name in the short bio', () => {
    const result = fakeBioGeneration({ artistId: 'a', displayName: 'Test Artist' });
    if (!result.ok) throw new Error('fixture must succeed');
    expect(result.data.shortBio).toContain('Test Artist');
  });

  it('returns media v2 fields for palette e2e coverage', () => {
    const result = fakeBioGeneration({ artistId: 'a', displayName: 'Test Artist' });
    if (!result.ok) throw new Error('fixture must succeed');
    expect(result.data.images.length).toBeGreaterThanOrEqual(2);
    expect(result.data.images.some((image) => image.kind === 'cover')).toBe(true);
    expect(result.data.images.every((image) => (image.alt ?? '').length > 0)).toBe(true);
    expect(result.data.links.some((link) => link.kind === 'press')).toBe(true);
  });
});
