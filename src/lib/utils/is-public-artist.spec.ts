/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';

import { isPublicArtist } from './is-public-artist';

describe('isPublicArtist', () => {
  const visible = { isActive: true, publishedOn: new Date('2024-01-01'), deletedOn: null };

  it('is true for a current, published, non-deleted artist', () => {
    expect(isPublicArtist(visible)).toBe(true);
  });

  it('accepts an ISO string publication date', () => {
    expect(isPublicArtist({ ...visible, publishedOn: '2024-01-01T00:00:00.000Z' })).toBe(true);
  });

  // The index lists alumni and links their cards to the detail page (#769).
  it('is true for a published, non-deleted alumnus', () => {
    expect(
      isPublicArtist({ ...visible, isActive: false, deactivatedAt: new Date('2025-03-01') })
    ).toBe(true);
  });

  it('accepts an ISO string departure date', () => {
    expect(
      isPublicArtist({ ...visible, isActive: false, deactivatedAt: '2025-03-01T00:00:00.000Z' })
    ).toBe(true);
  });

  it('treats an absent deletedOn (legacy document) as not deleted', () => {
    expect(isPublicArtist({ isActive: true, publishedOn: new Date('2024-01-01') })).toBe(true);
  });

  it.each([
    ['unpublished (null)', { ...visible, publishedOn: null }],
    ['unpublished (absent)', { isActive: true, deletedOn: null }],
    ['deactivated (no departure date)', { ...visible, isActive: false }],
    ['deactivated (null departure date)', { ...visible, isActive: false, deactivatedAt: null }],
    [
      'soft-deleted alumnus',
      {
        ...visible,
        isActive: false,
        deactivatedAt: new Date('2025-03-01'),
        deletedOn: new Date('2025-06-01'),
      },
    ],
    [
      'unpublished alumnus',
      { ...visible, isActive: false, deactivatedAt: new Date('2025-03-01'), publishedOn: null },
    ],
    ['soft-deleted', { ...visible, deletedOn: new Date('2024-06-01') }],
  ])('is false for a %s artist', (_label, artist) => {
    expect(isPublicArtist(artist)).toBe(false);
  });
});
