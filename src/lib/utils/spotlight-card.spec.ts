/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type {
  FeaturedArtist,
  FeaturedArtistFormatFile,
  PublishedReleaseListing,
} from '@/lib/types/media-models';

import {
  publishedReleasesToSpotlightCards,
  SPOTLIGHT_COVER_SPAN_CLASS,
  toSpotlightCards,
} from './spotlight-card';

vi.mock('@/lib/utils/cdn-url', () => ({
  resolveStreamUrl: ({ s3Key }: { s3Key?: string | null }) => (s3Key ? `cdn:${s3Key}` : null),
}));

const makeFile = (trackNumber: number): FeaturedArtistFormatFile =>
  ({
    id: `file-${trackNumber}`,
    trackNumber,
    s3Key: `audio/${trackNumber}.mp3`,
    fileName: `${trackNumber}.mp3`,
  }) as FeaturedArtistFormatFile;

const makeSpotlight = (overrides: Partial<FeaturedArtist> = {}): FeaturedArtist =>
  ({
    id: 'fa-1',
    displayName: 'Spot Artist',
    coverArt: null,
    featuredTrackNumber: null,
    artists: [
      {
        id: 'a-1',
        displayName: 'Spot Artist',
        firstName: 'Spot',
        surname: 'Artist',
        slug: 'spot-artist',
        bioImages: [],
      },
    ],
    digitalFormat: { files: [makeFile(2), makeFile(1), makeFile(3)] },
    release: {
      id: 'rel-1',
      title: 'Spot Album',
      coverArt: '/media/releases/rel-1/cover.jpg',
      releasedOn: new Date('2024-01-01T00:00:00Z'),
      images: [],
    },
    ...overrides,
  }) as FeaturedArtist;

const makeListing = (overrides: Partial<PublishedReleaseListing> = {}): PublishedReleaseListing =>
  ({
    id: 'rel-9',
    title: 'Newest Album',
    coverArt: '/media/releases/rel-9/cover.jpg',
    releasedOn: new Date('2025-12-31T23:30:00Z'),
    images: [],
    digitalFormats: [{ files: [{ s3Key: 'audio/first.mp3' }] }],
    albumArtist: {
      id: 'a-9',
      firstName: 'Ada',
      surname: 'Lovelace',
      displayName: null,
      slug: 'ada-lovelace',
      publishedOn: new Date('2020-01-01T00:00:00Z'),
      deletedOn: null,
    },
    ...overrides,
  }) as PublishedReleaseListing;

describe('toSpotlightCards', () => {
  it('maps a spotlight row to a card', () => {
    expect(toSpotlightCards([makeSpotlight()])).toEqual([
      {
        releaseId: 'rel-1',
        title: 'Spot Album',
        year: 2024,
        artistName: 'Spot Artist',
        artistSlug: 'spot-artist',
        coverArt: '/media/releases/rel-1/cover.jpg',
        playSrc: 'cdn:audio/1.mp3',
        initialTrackNumber: 1,
      },
    ]);
  });

  it('keeps the order the rows arrive in', () => {
    const cards = toSpotlightCards([
      makeSpotlight({ id: 'fa-b', displayName: 'B' }),
      makeSpotlight({ id: 'fa-a', displayName: 'A' }),
    ]);

    expect(cards.map((card) => card.artistName)).toEqual(['B', 'A']);
  });

  it('skips a row with no release', () => {
    expect(toSpotlightCards([makeSpotlight({ release: null })])).toEqual([]);
  });

  it('skips a row with no display name', () => {
    expect(toSpotlightCards([makeSpotlight({ displayName: null, artists: [] })])).toEqual([]);
  });

  it('reads the year in UTC', () => {
    const release = {
      id: 'rel-1',
      title: 'Spot Album',
      coverArt: '',
      releasedOn: new Date('2023-12-31T23:30:00Z'),
      images: [],
    };

    expect(toSpotlightCards([makeSpotlight({ release })])[0]?.year).toBe(2023);
  });

  it('gives a null slug when the row names no artist', () => {
    expect(toSpotlightCards([makeSpotlight({ artists: [] })])[0]?.artistSlug).toBeNull();
  });

  it('prefers the spotlight cover art over the release cover', () => {
    const [card] = toSpotlightCards([makeSpotlight({ coverArt: '/media/spotlight/cover.jpg' })]);

    expect(card?.coverArt).toBe('/media/spotlight/cover.jpg');
  });

  it('gives a null cover when nothing resolves', () => {
    const release = {
      id: 'rel-1',
      title: 'Spot Album',
      coverArt: '',
      releasedOn: new Date('2024-01-01T00:00:00Z'),
      images: [],
    };

    expect(toSpotlightCards([makeSpotlight({ release })])[0]?.coverArt).toBeNull();
  });

  it('starts on the featured track when it is set', () => {
    const [card] = toSpotlightCards([makeSpotlight({ featuredTrackNumber: 3 })]);

    expect(card).toMatchObject({ playSrc: 'cdn:audio/3.mp3', initialTrackNumber: 3 });
  });

  it('starts on the first sorted track when the featured track has no file', () => {
    const [card] = toSpotlightCards([makeSpotlight({ featuredTrackNumber: 9 })]);

    expect(card).toMatchObject({ playSrc: 'cdn:audio/1.mp3', initialTrackNumber: 1 });
  });

  it('has nothing to play when the row has no format', () => {
    const [card] = toSpotlightCards([makeSpotlight({ digitalFormat: null })]);

    expect(card).toMatchObject({ playSrc: null, initialTrackNumber: null });
  });
});

describe('publishedReleasesToSpotlightCards', () => {
  it('maps a listing row to a card', () => {
    expect(publishedReleasesToSpotlightCards([makeListing()])).toEqual([
      {
        releaseId: 'rel-9',
        title: 'Newest Album',
        year: 2025,
        artistName: 'Ada Lovelace',
        artistSlug: 'ada-lovelace',
        coverArt: '/media/releases/rel-9/cover.jpg',
        playSrc: 'cdn:audio/first.mp3',
        initialTrackNumber: null,
      },
    ]);
  });

  it('gives a null name and slug when the release has no album artist', () => {
    const [card] = publishedReleasesToSpotlightCards([makeListing({ albumArtist: null })]);

    expect(card).toMatchObject({ artistName: null, artistSlug: null });
  });

  it('falls back to the first image when the release has no cover art', () => {
    const [card] = publishedReleasesToSpotlightCards([
      makeListing({
        coverArt: '',
        images: [{ src: '/media/releases/rel-9/img.jpg', altText: null }],
      }),
    ]);

    expect(card?.coverArt).toBe('/media/releases/rel-9/img.jpg');
  });

  it('gives a null cover when the release has no art at all', () => {
    const [card] = publishedReleasesToSpotlightCards([makeListing({ coverArt: '', images: [] })]);

    expect(card?.coverArt).toBeNull();
  });

  it('has nothing to play when the release has no track', () => {
    const [card] = publishedReleasesToSpotlightCards([makeListing({ digitalFormats: [] })]);

    expect(card?.playSrc).toBeNull();
  });
});

describe('SPOTLIGHT_COVER_SPAN_CLASS', () => {
  it('spans the outer cover edges of the one, two and four column grids', () => {
    // 13rem covers centered in cells with a 1.5rem gap: the outer edges sit
    // 100% - (cell - 13rem) apart, never more than the full width.
    expect(SPOTLIGHT_COVER_SPAN_CLASS.split(' ')).toEqual([
      'mx-auto',
      'w-[min(100%,13rem)]',
      'sm:w-[min(100%,calc(50%_+_13.75rem))]',
      'lg:w-[min(100%,calc(75%_+_14.125rem))]',
    ]);
  });
});
