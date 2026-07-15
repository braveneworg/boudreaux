/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildArtistListParams, getArtistDisplayName } from './artist-combobox-helpers';

import type { ArtistRow } from './artist-combobox-helpers';

// ---------------------------------------------------------------------------
// getArtistDisplayName
// ---------------------------------------------------------------------------

describe('getArtistDisplayName', () => {
  const base: ArtistRow = {
    id: 'a1',
    displayName: null,
    firstName: null,
    surname: 'Doe',
    slug: 'doe',
  };

  it('returns displayName when set', () => {
    expect(getArtistDisplayName({ ...base, displayName: 'Stage Name' })).toBe('Stage Name');
  });

  it('returns firstName + surname when displayName is null', () => {
    expect(getArtistDisplayName({ ...base, firstName: 'John', surname: 'Doe' })).toBe('John Doe');
  });

  it('returns surname alone when firstName is null', () => {
    expect(getArtistDisplayName({ ...base, firstName: null, surname: 'Doe' })).toBe('Doe');
  });

  it('returns "(no name)" when displayName is null and surname is empty', () => {
    expect(getArtistDisplayName({ ...base, firstName: null, surname: '' })).toBe('(no name)');
  });
});

// ---------------------------------------------------------------------------
// buildArtistListParams
// ---------------------------------------------------------------------------

describe('buildArtistListParams', () => {
  it('returns undefined search and take:5 for an empty search string', () => {
    expect(buildArtistListParams('')).toEqual({ search: undefined, take: 5 });
  });

  it('returns the search term and undefined take when a search is present', () => {
    expect(buildArtistListParams('jazz')).toEqual({ search: 'jazz', take: undefined });
  });
});
