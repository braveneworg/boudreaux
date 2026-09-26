/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';

import { isVisibleArtist } from './artist-visibility';

describe('isVisibleArtist', () => {
  const visible = { isActive: true, publishedOn: new Date('2024-01-01'), deletedOn: null };

  it('is true for an active, published, non-deleted artist', () => {
    expect(isVisibleArtist(visible)).toBe(true);
  });

  it('accepts an ISO string publication date', () => {
    expect(isVisibleArtist({ ...visible, publishedOn: '2024-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('treats an absent deletedOn (legacy document) as not deleted', () => {
    expect(isVisibleArtist({ isActive: true, publishedOn: new Date('2024-01-01') })).toBe(true);
  });

  it.each([
    ['unpublished (null)', { ...visible, publishedOn: null }],
    ['unpublished (absent)', { isActive: true, deletedOn: null }],
    ['deactivated', { ...visible, isActive: false }],
    ['soft-deleted', { ...visible, deletedOn: new Date('2024-06-01') }],
  ])('is false for a %s artist', (_label, artist) => {
    expect(isVisibleArtist(artist)).toBe(false);
  });
});
