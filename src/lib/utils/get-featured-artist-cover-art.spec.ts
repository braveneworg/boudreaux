/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FeaturedArtist } from '@/lib/types/domain/featured-artist';

import { getFeaturedArtistCoverArt } from './get-featured-artist-cover-art';

const base = {
  id: 'fa-1',
  displayName: null,
  featuredOn: new Date('2024-01-01'),
  featuredUntil: null,
  digitalFormatId: null,
  releaseId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  publishedOn: null,
  position: 1,
  description: null,
  coverArt: null,
  featuredTrackNumber: null,
  artists: [],
  digitalFormat: null,
  release: null,
} satisfies FeaturedArtist;

const makeArtist = (bioImages: Array<{ url: string }>) => ({
  id: 'a-1',
  displayName: null,
  firstName: 'Test',
  surname: 'Artist',
  slug: 'test-artist',
  bioImages,
});

const makeRelease = (
  overrides: Partial<{ coverArt: string; images: Array<{ src: string | null }> }> = {}
) => ({
  id: 'r-1',
  title: 'Test Album',
  coverArt: 'https://cdn.example.com/album.jpg',
  images: [],
  ...overrides,
});

describe('getFeaturedArtistCoverArt', () => {
  describe('tier 1 – featured.coverArt', () => {
    it('returns featured.coverArt when set', () => {
      const featured: FeaturedArtist = { ...base, coverArt: 'https://cdn.example.com/cover.jpg' };
      expect(getFeaturedArtistCoverArt(featured)).toBe('https://cdn.example.com/cover.jpg');
    });

    it('falls through when featured.coverArt is null', () => {
      const featured: FeaturedArtist = { ...base, coverArt: null };
      expect(getFeaturedArtistCoverArt(featured)).toBeNull();
    });
  });

  describe('tier 2 – release.coverArt', () => {
    it('returns release.coverArt when no featured.coverArt', () => {
      const featured: FeaturedArtist = {
        ...base,
        coverArt: null,
        release: makeRelease({ coverArt: 'https://cdn.example.com/release.jpg' }),
      };
      expect(getFeaturedArtistCoverArt(featured)).toBe('https://cdn.example.com/release.jpg');
    });
  });

  describe('tier 3 – release.images[0].src', () => {
    it('returns release.images[0].src when no coverArt or release.coverArt', () => {
      const featured: FeaturedArtist = {
        ...base,
        coverArt: null,
        release: makeRelease({
          coverArt: '',
          images: [{ src: 'https://cdn.example.com/release-img.jpg' }],
        }),
      };
      expect(getFeaturedArtistCoverArt(featured)).toBe('https://cdn.example.com/release-img.jpg');
    });

    it('falls through when release.images is empty', () => {
      const featured: FeaturedArtist = {
        ...base,
        coverArt: null,
        release: makeRelease({ coverArt: '', images: [] }),
      };
      expect(getFeaturedArtistCoverArt(featured)).toBeNull();
    });

    it('falls through when release.images[0].src is falsy', () => {
      const featured: FeaturedArtist = {
        ...base,
        coverArt: null,
        release: makeRelease({ coverArt: '', images: [{ src: '' }] }),
      };
      expect(getFeaturedArtistCoverArt(featured)).toBeNull();
    });
  });

  describe('tier 4 – artist.bioImages[0].url', () => {
    it('returns the first artist bioImages[0].url when no higher-priority art', () => {
      const featured = {
        ...base,
        coverArt: null,
        release: null,
        artists: [makeArtist([{ url: 'https://cdn.example.com/bio.jpg' }])],
      } as unknown as FeaturedArtist;
      expect(getFeaturedArtistCoverArt(featured)).toBe('https://cdn.example.com/bio.jpg');
    });

    it('skips artists with empty bioImages and uses the next artist', () => {
      const featured = {
        ...base,
        coverArt: null,
        release: null,
        artists: [makeArtist([]), makeArtist([{ url: 'https://cdn.example.com/second.jpg' }])],
      } as unknown as FeaturedArtist;
      expect(getFeaturedArtistCoverArt(featured)).toBe('https://cdn.example.com/second.jpg');
    });

    it('returns null when all artists have empty bioImages', () => {
      const featured = {
        ...base,
        coverArt: null,
        release: null,
        artists: [makeArtist([]), makeArtist([])],
      } as unknown as FeaturedArtist;
      expect(getFeaturedArtistCoverArt(featured)).toBeNull();
    });

    it('returns null when artists array is empty', () => {
      const featured: FeaturedArtist = { ...base, coverArt: null, release: null, artists: [] };
      expect(getFeaturedArtistCoverArt(featured)).toBeNull();
    });

    it('returns null when artist has no bioImages property', () => {
      const featured = {
        ...base,
        coverArt: null,
        release: null,
        artists: [{ id: 'a-1', firstName: 'X', surname: 'Y', slug: 'x-y', displayName: null }],
      } as unknown as FeaturedArtist;
      expect(getFeaturedArtistCoverArt(featured)).toBeNull();
    });
  });

  describe('fallback chain precedence', () => {
    it('prefers featured.coverArt over all other sources', () => {
      const featured = {
        ...base,
        coverArt: 'https://cdn.example.com/featured.jpg',
        release: makeRelease({ coverArt: 'https://cdn.example.com/release.jpg' }),
        artists: [makeArtist([{ url: 'https://cdn.example.com/bio.jpg' }])],
      } as unknown as FeaturedArtist;
      expect(getFeaturedArtistCoverArt(featured)).toBe('https://cdn.example.com/featured.jpg');
    });

    it('prefers release.coverArt over release.images and artist.bioImages', () => {
      const featured = {
        ...base,
        coverArt: null,
        release: makeRelease({
          coverArt: 'https://cdn.example.com/release.jpg',
          images: [{ src: 'https://cdn.example.com/release-img.jpg' }],
        }),
        artists: [makeArtist([{ url: 'https://cdn.example.com/bio.jpg' }])],
      } as unknown as FeaturedArtist;
      expect(getFeaturedArtistCoverArt(featured)).toBe('https://cdn.example.com/release.jpg');
    });

    it('prefers release.images over artist.bioImages', () => {
      const featured = {
        ...base,
        coverArt: null,
        release: makeRelease({
          coverArt: '',
          images: [{ src: 'https://cdn.example.com/release-img.jpg' }],
        }),
        artists: [makeArtist([{ url: 'https://cdn.example.com/bio.jpg' }])],
      } as unknown as FeaturedArtist;
      expect(getFeaturedArtistCoverArt(featured)).toBe('https://cdn.example.com/release-img.jpg');
    });
  });
});
