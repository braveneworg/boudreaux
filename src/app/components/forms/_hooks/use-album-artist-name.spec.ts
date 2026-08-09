// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { renderHook } from '@testing-library/react';

import { useAlbumArtistName } from './use-album-artist-name';
import { useArtistsQuery } from './use-artists-query';

vi.mock('./use-artists-query', () => ({ useArtistsQuery: vi.fn() }));

const mockArtists = (artistsById: Record<string, unknown>): void => {
  vi.mocked(useArtistsQuery).mockReturnValue({
    artistsById,
    isPending: false,
  } as unknown as ReturnType<typeof useArtistsQuery>);
};

const artist = {
  displayName: null,
  firstName: 'John',
  middleName: null,
  surname: 'Doe',
  title: null,
  suffix: null,
};

describe('useAlbumArtistName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArtists({});
  });

  it('fetches only the first credited artist', () => {
    mockArtists({ 'artist-1': artist });

    renderHook(() => useAlbumArtistName(['artist-1', 'artist-2']));

    expect(useArtistsQuery).toHaveBeenCalledWith(['artist-1']);
  });

  it('returns the resolved display name', () => {
    mockArtists({ 'artist-1': { ...artist, displayName: 'JD the Great' } });

    const { result } = renderHook(() => useAlbumArtistName(['artist-1']));

    expect(result.current).toBe('JD the Great');
  });

  it('builds a name from the parts when there is no display name', () => {
    mockArtists({ 'artist-1': artist });

    const { result } = renderHook(() => useAlbumArtistName(['artist-1']));

    expect(result.current).toBe('John Doe');
  });

  it('queries nothing and returns null when no artist is credited', () => {
    const { result } = renderHook(() => useAlbumArtistName([]));

    expect(useArtistsQuery).toHaveBeenCalledWith([]);
    expect(result.current).toBeNull();
  });

  it('returns null when the artist ids are undefined', () => {
    const { result } = renderHook(() => useAlbumArtistName(undefined));

    expect(result.current).toBeNull();
  });

  it('returns null while the artist is still loading', () => {
    mockArtists({ 'artist-1': undefined });

    const { result } = renderHook(() => useAlbumArtistName(['artist-1']));

    expect(result.current).toBeNull();
  });
});
