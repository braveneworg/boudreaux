/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  buildReleaseSearchValue,
  getArtistDisplayNameForRelease,
  getBandcampUrl,
  getReleaseCoverArt,
} from './release-helpers';

describe('release-helpers', () => {
  describe('getArtistDisplayNameForRelease', () => {
    it('should return displayName when present', () => {
      const artist = {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'JD the Great',
        groups: [],
      };

      expect(getArtistDisplayNameForRelease(artist)).toBe('JD the Great');
    });

    it('should return firstName + surname when displayName is null', () => {
      const artist = {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: null,
        groups: [],
      };

      expect(getArtistDisplayNameForRelease(artist)).toBe('John Doe');
    });

    it('should return group displayName when artist has no displayName and group exists', () => {
      const artist = {
        id: 'artist-1',
        firstName: '',
        surname: '',
        displayName: null,
        groups: [
          {
            id: 'ag-1',
            artistId: 'artist-1',
            groupId: 'group-1',
            group: { id: 'group-1', displayName: 'The Band' },
          },
        ],
      };

      expect(getArtistDisplayNameForRelease(artist)).toBe('The Band');
    });

    it('should return "Unknown Artist" when no name sources available', () => {
      const artist = {
        id: 'artist-1',
        firstName: '',
        surname: '',
        displayName: null,
        groups: [],
      };

      expect(getArtistDisplayNameForRelease(artist)).toBe('Unknown Artist');
    });

    it('should prefer displayName over group name', () => {
      const artist = {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'Stage Name',
        groups: [
          {
            id: 'ag-1',
            artistId: 'artist-1',
            groupId: 'group-1',
            group: { id: 'group-1', displayName: 'The Band' },
          },
        ],
      };

      expect(getArtistDisplayNameForRelease(artist)).toBe('Stage Name');
    });

    it('should handle empty displayName as falsy', () => {
      const artist = {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: '',
        groups: [],
      };

      expect(getArtistDisplayNameForRelease(artist)).toBe('John Doe');
    });

    it('should use first group when multiple groups exist', () => {
      const artist = {
        id: 'artist-1',
        firstName: '',
        surname: '',
        displayName: null,
        groups: [
          {
            id: 'ag-1',
            artistId: 'artist-1',
            groupId: 'group-1',
            group: { id: 'group-1', displayName: 'First Band' },
          },
          {
            id: 'ag-2',
            artistId: 'artist-1',
            groupId: 'group-2',
            group: { id: 'group-2', displayName: 'Second Band' },
          },
        ],
      };

      expect(getArtistDisplayNameForRelease(artist)).toBe('First Band');
    });

    it('should fall through group with null displayName', () => {
      const artist = {
        id: 'artist-1',
        firstName: '',
        surname: '',
        displayName: null,
        groups: [
          {
            id: 'ag-1',
            artistId: 'artist-1',
            groupId: 'group-1',
            group: { id: 'group-1', displayName: null },
          },
        ],
      };

      expect(getArtistDisplayNameForRelease(artist)).toBe('Unknown Artist');
    });
  });

  describe('getReleaseCoverArt', () => {
    it('should return coverArt when non-empty', () => {
      const release = {
        title: 'Test Album',
        coverArt: 'https://example.com/cover.jpg',
        images: [],
      };

      const result = getReleaseCoverArt(release);

      expect(result).toEqual({
        src: 'https://example.com/cover.jpg',
        alt: 'Test Album cover art',
      });
    });

    it('should fall back to first image when coverArt is empty string', () => {
      const release = {
        title: 'Test Album',
        coverArt: '',
        images: [
          {
            id: 'img-1',
            src: 'https://example.com/img.jpg',
            altText: 'Album image',
            sortOrder: 0,
          },
        ],
      };

      const result = getReleaseCoverArt(release);

      expect(result).toEqual({
        src: 'https://example.com/img.jpg',
        alt: 'Album image',
      });
    });

    it('should use release title in alt when image has no altText', () => {
      const release = {
        title: 'Test Album',
        coverArt: '',
        images: [
          {
            id: 'img-1',
            src: 'https://example.com/img.jpg',
            altText: null,
            sortOrder: 0,
          },
        ],
      };

      const result = getReleaseCoverArt(release);

      expect(result).toEqual({
        src: 'https://example.com/img.jpg',
        alt: 'Test Album cover art',
      });
    });

    it('should return null when no coverArt and no images', () => {
      const release = {
        title: 'Test Album',
        coverArt: '',
        images: [],
      };

      expect(getReleaseCoverArt(release)).toBeNull();
    });

    it('should return null when coverArt is empty and first image has no src', () => {
      const release = {
        title: 'Test Album',
        coverArt: '',
        images: [
          {
            id: 'img-1',
            src: null,
            altText: null,
            sortOrder: 0,
          },
        ],
      };

      expect(getReleaseCoverArt(release)).toBeNull();
    });
  });

  describe('getBandcampUrl', () => {
    it('should return the Bandcamp URL when present', () => {
      const release = {
        releaseUrls: [
          {
            id: 'ru-1',
            releaseId: 'r-1',
            urlId: 'u-1',
            url: {
              id: 'u-1',
              platform: 'BANDCAMP' as const,
              url: 'https://label.bandcamp.com/album/test',
            },
          },
        ],
      };

      expect(getBandcampUrl(release)).toBe('https://label.bandcamp.com/album/test');
    });

    it('should return null when no Bandcamp URL exists', () => {
      const release = {
        releaseUrls: [
          {
            id: 'ru-1',
            releaseId: 'r-1',
            urlId: 'u-1',
            url: {
              id: 'u-1',
              platform: 'SPOTIFY' as const,
              url: 'https://open.spotify.com/album/test',
            },
          },
        ],
      };

      expect(getBandcampUrl(release)).toBeNull();
    });

    it('should return null when releaseUrls is empty', () => {
      const release = { releaseUrls: [] };

      expect(getBandcampUrl(release)).toBeNull();
    });

    it('should return first Bandcamp URL when multiple exist', () => {
      const release = {
        releaseUrls: [
          {
            id: 'ru-1',
            releaseId: 'r-1',
            urlId: 'u-1',
            url: {
              id: 'u-1',
              platform: 'BANDCAMP' as const,
              url: 'https://first.bandcamp.com/album/test',
            },
          },
          {
            id: 'ru-2',
            releaseId: 'r-1',
            urlId: 'u-2',
            url: {
              id: 'u-2',
              platform: 'BANDCAMP' as const,
              url: 'https://second.bandcamp.com/album/test',
            },
          },
        ],
      };

      expect(getBandcampUrl(release)).toBe('https://first.bandcamp.com/album/test');
    });
  });

  describe('buildReleaseSearchValue', () => {
    it('should concatenate title, artist names, and group names', () => {
      const release = {
        title: 'Midnight Serenade',
        artistReleases: [
          {
            artist: {
              firstName: 'John',
              surname: 'Doe',
              displayName: 'JD',
              groups: [
                {
                  group: { displayName: 'The Does' },
                },
              ],
            },
          },
        ],
      };

      const result = buildReleaseSearchValue(release);

      expect(result).toContain('midnight serenade');
      expect(result).toContain('john');
      expect(result).toContain('doe');
      expect(result).toContain('jd');
      expect(result).toContain('the does');
    });

    it('should return lowercase string', () => {
      const release = {
        title: 'LOUD ALBUM',
        artistReleases: [
          {
            artist: {
              firstName: 'JANE',
              surname: 'DOE',
              displayName: null,
              groups: [],
            },
          },
        ],
      };

      const result = buildReleaseSearchValue(release);

      expect(result).toBe(result.toLowerCase());
    });

    it('should handle multiple artists', () => {
      const release = {
        title: 'Collab',
        artistReleases: [
          {
            artist: {
              firstName: 'A',
              surname: 'B',
              displayName: null,
              groups: [],
            },
          },
          {
            artist: {
              firstName: 'C',
              surname: 'D',
              displayName: null,
              groups: [],
            },
          },
        ],
      };

      const result = buildReleaseSearchValue(release);

      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).toContain('c');
      expect(result).toContain('d');
    });

    it('should handle release with no artists gracefully', () => {
      const release = {
        title: 'Solo Album',
        artistReleases: [],
      };

      const result = buildReleaseSearchValue(release);

      expect(result).toContain('solo album');
    });

    it('should filter out null and empty values', () => {
      const release = {
        title: 'Test',
        artistReleases: [
          {
            artist: {
              firstName: '',
              surname: '',
              displayName: null,
              groups: [
                {
                  group: { displayName: null },
                },
              ],
            },
          },
        ],
      };

      const result = buildReleaseSearchValue(release);

      expect(result).toBe('test');
    });
  });
});
