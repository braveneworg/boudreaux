/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPublicArtist } from './is-public-artist';

describe('isPublicArtist', () => {
  const visible = { publishedOn: new Date('2024-01-01'), deletedOn: null };

  it('is true for a published, non-deleted artist', () => {
    expect(isPublicArtist(visible)).toBe(true);
  });

  it('accepts an ISO string publication date', () => {
    expect(isPublicArtist({ ...visible, publishedOn: '2024-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('treats an absent deletedOn (legacy document) as not deleted', () => {
    expect(isPublicArtist({ publishedOn: new Date('2024-01-01') })).toBe(true);
  });

  // Whether an artist is still on the label decides nothing (ADR-0016). A
  // stored document may still carry the fields the rule once read.
  it.each([
    ['a departure date', { deactivatedAt: new Date('2025-03-01') }],
    ['the removed isActive flag set to false', { isActive: false }],
  ])('is true for a published artist that carries %s', (_label, legacy) => {
    expect(isPublicArtist({ ...visible, ...legacy })).toBe(true);
  });

  it.each([
    ['unpublished (null)', { ...visible, publishedOn: null }],
    ['unpublished (absent)', { deletedOn: null }],
    ['soft-deleted', { ...visible, deletedOn: new Date('2024-06-01') }],
    ['soft-deleted and unpublished', { publishedOn: null, deletedOn: new Date('2024-06-01') }],
  ])('is false for a %s artist', (_label, artist) => {
    expect(isPublicArtist(artist)).toBe(false);
  });
});
