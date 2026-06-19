/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  artistScalarSchema,
  artistSchema,
  artistWithPublishedReleasesSchema,
  featuredArtistSchema,
  formatSchema,
  platformSchema,
  publishedReleaseDetailSchema,
  publishedReleaseListingSchema,
  releaseCarouselItemSchema,
  releaseSchema,
} from './media-models-schema';

const ISO = '2024-01-02T03:04:05.000Z';

/** Full `Image` scalar wire shape. */
const image = {
  id: 'i1',
  caption: null,
  artistId: 'a1',
  releaseId: null,
  createdAt: ISO,
  updatedAt: ISO,
  src: 'cover.jpg',
  altText: null,
  sortOrder: 0,
  urlId: null,
};

/** Base `Url` scalar wire shape. */
const url = { id: 'u1', artistId: 'a1', releaseId: null, platform: 'SPOTIFY', url: 'https://x' };

/** All `Artist` scalars — a mix of populated and null date/string fields to
 * exercise both the coercion and the nullable branches. */
const artistScalar = {
  id: 'a1',
  firstName: 'John',
  middleName: 'Q',
  surname: 'Doe',
  akaNames: null,
  displayName: null,
  title: null,
  suffix: null,
  phone: null,
  email: null,
  address1: null,
  address2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  bio: null,
  shortBio: null,
  altBio: null,
  bioGeneratedAt: null,
  bioModel: null,
  slug: 'john-doe',
  genres: null,
  bornOn: ISO,
  diedOn: null,
  formedOn: null,
  publishedOn: null,
  publishedBy: null,
  createdAt: ISO,
  createdBy: null,
  updatedAt: ISO,
  updatedBy: null,
  deletedOn: null,
  deletedBy: null,
  deactivatedAt: null,
  deactivatedBy: null,
  reactivatedAt: null,
  reactivatedBy: null,
  notes: ['internal note'],
  tags: null,
  isPseudonymous: false,
  isActive: true,
  instruments: null,
  featuredArtistId: null,
};

/** All `Release` scalars, including a `Json[]` `extendedData` that exercises
 * every member of the recursive json value union. */
const releaseScalar = {
  id: 'r1',
  title: 'Midnight',
  labels: ['Indie'],
  releasedOn: ISO,
  catalogNumber: null,
  coverArt: 'cover.jpg',
  description: null,
  downloadUrls: ['https://dl'],
  formats: ['DIGITAL', 'MP3_320KBPS'],
  extendedData: [{ s: 'a', n: 1, b: true, nil: null, arr: [1, 'x', false, null], obj: { k: 'v' } }],
  notes: ['n'],
  executiveProducedBy: [],
  coProducedBy: [],
  masteredBy: [],
  mixedBy: [],
  recordedBy: [],
  artBy: [],
  designBy: [],
  photographyBy: [],
  linerNotesBy: [],
  imageTypes: [],
  variants: [],
  createdAt: ISO,
  updatedAt: ISO,
  deletedOn: null,
  publishedAt: ISO,
  featuredOn: null,
  featuredUntil: null,
  featuredDescription: null,
  tagId: null,
  suggestedPrice: 500,
};

/** A digital format file whose `fileSize` arrives as a serialized number. */
const digitalFormatFile = {
  id: 'f1',
  formatId: 'df1',
  trackNumber: 1,
  title: null,
  duration: 180,
  s3Key: 'k',
  fileName: '01.mp3',
  fileSize: 1234,
  mimeType: 'audio/mpeg',
  checksum: null,
  uploadedAt: ISO,
  createdAt: ISO,
  updatedAt: ISO,
};

const digitalFormat = {
  id: 'df1',
  releaseId: 'r1',
  formatType: 'MP3_320KBPS',
  s3Key: null,
  fileName: null,
  fileSize: 5000,
  mimeType: null,
  trackCount: 1,
  totalFileSize: 5000,
  checksum: null,
  deletedAt: null,
  uploadedAt: ISO,
  createdAt: ISO,
  updatedAt: ISO,
  files: [digitalFormatFile],
};

const artist = {
  ...artistScalar,
  images: [image],
  labels: [{ id: 'al1', artistId: 'a1', labelId: 'l1' }],
  releases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', release: releaseScalar }],
  urls: [url],
};

const release = {
  ...releaseScalar,
  images: [image],
  artistReleases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', artist: artistScalar }],
  digitalFormats: [digitalFormat],
  releaseUrls: [{ id: 'ru1', releaseId: 'r1', urlId: 'u1', url }],
};

const featuredArtist = {
  id: 'fa1',
  displayName: null,
  featuredOn: ISO,
  featuredUntil: null,
  digitalFormatId: null,
  createdAt: ISO,
  updatedAt: ISO,
  publishedOn: null,
  position: 0,
  description: null,
  coverArt: null,
  featuredTrackNumber: null,
  releaseId: null,
  artists: [{ ...artistScalar, images: [image] }],
  digitalFormat,
  release: {
    ...releaseScalar,
    images: [image],
    artistReleases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', artist: artistScalar }],
  },
};

const publishedReleaseListing = {
  id: 'r1',
  title: 'Midnight',
  coverArt: 'cover.jpg',
  releasedOn: ISO,
  images: [{ src: null, altText: null }],
  artistReleases: [{ artist: { id: 'a1', firstName: 'John', surname: 'Doe', displayName: null } }],
  releaseUrls: [{ url: { platform: 'BANDCAMP', url: 'https://bc' } }],
};

/** Narrowed artist projection on the media-player release-detail page. */
const releaseDetailArtist = {
  id: 'a1',
  firstName: 'John',
  middleName: 'Q',
  surname: 'Doe',
  displayName: null,
  title: null,
  suffix: null,
};

/** `PublishedReleaseDetail` wire shape — the `withTracks` release payload. */
const publishedReleaseDetail = {
  ...releaseScalar,
  images: [image],
  artistReleases: [{ artist: releaseDetailArtist }],
  digitalFormats: [digitalFormat],
  releaseUrls: [{ id: 'ru1', releaseId: 'r1', urlId: 'u1', url }],
};

/** `ArtistWithPublishedReleases` wire shape — the artist detail page payload. */
const artistWithPublishedReleases = {
  ...artistScalar,
  images: [image],
  labels: [{ id: 'al1', artistId: 'a1', labelId: 'l1' }],
  urls: [url],
  bioImages: [
    {
      id: 'bi1',
      artistId: 'a1',
      url: 'https://upload.wikimedia.org/a.jpg',
      thumbnailUrl: 'https://upload.wikimedia.org/thumb/a.jpg',
      title: 'Portrait',
      attribution: 'Wikimedia Commons',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
      width: 1200,
      height: 800,
      isPrimary: true,
      sortOrder: 0,
      createdAt: ISO,
    },
  ],
  bioLinks: [
    {
      id: 'bl1',
      artistId: 'a1',
      label: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/x',
      kind: 'wikipedia',
      sortOrder: 0,
    },
  ],
  members: [{ id: 'am1', artistId: 'a1', memberId: 'a2', member: { ...artistScalar, id: 'a2' } }],
  releases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', release }],
};

describe('platformSchema', () => {
  it('accepts a known platform', () => {
    expect(platformSchema.parse('SPOTIFY')).toBe('SPOTIFY');
  });

  it('rejects an unknown platform', () => {
    expect(() => platformSchema.parse('MYSPACE')).toThrow();
  });
});

describe('formatSchema', () => {
  it('accepts a known format', () => {
    expect(formatSchema.parse('VINYL')).toBe('VINYL');
  });

  it('rejects an unknown format', () => {
    expect(() => formatSchema.parse('8_TRACK')).toThrow();
  });
});

describe('artistScalarSchema', () => {
  it('parses a fully populated artist scalar record', () => {
    expect(() => artistScalarSchema.parse(artistScalar)).not.toThrow();
  });

  it('coerces an ISO date string into a Date', () => {
    expect(artistScalarSchema.parse(artistScalar).createdAt).toBeInstanceOf(Date);
  });

  it('keeps a null nullable date as null', () => {
    expect(artistScalarSchema.parse(artistScalar).diedOn).toBeNull();
  });
});

describe('artistSchema', () => {
  it('parses an artist with all relations', () => {
    expect(() => artistSchema.parse(artist)).not.toThrow();
  });

  it('rejects an artist missing a required scalar', () => {
    const { surname: _omit, ...invalid } = artist;
    expect(() => artistSchema.parse(invalid)).toThrow();
  });
});

describe('releaseSchema', () => {
  it('parses a release with all relations and json extendedData', () => {
    expect(() => releaseSchema.parse(release)).not.toThrow();
  });

  it('coerces a serialized file size number into a bigint', () => {
    expect(releaseSchema.parse(release).digitalFormats[0].files[0].fileSize).toBe(1234n);
  });

  it('coerces the releasedOn string into a Date', () => {
    expect(releaseSchema.parse(release).releasedOn).toBeInstanceOf(Date);
  });

  it('rejects a release with an unknown format enum value', () => {
    expect(() => releaseSchema.parse({ ...release, formats: ['NOT_A_FORMAT'] })).toThrow();
  });

  it('rejects a release whose url has an invalid platform', () => {
    const releaseUrls = [
      { id: 'ru1', releaseId: 'r1', urlId: 'u1', url: { ...url, platform: 'X' } },
    ];
    expect(() => releaseSchema.parse({ ...release, releaseUrls })).toThrow();
  });
});

describe('featuredArtistSchema', () => {
  it('parses a featured artist with a digital format and release', () => {
    expect(() => featuredArtistSchema.parse(featuredArtist)).not.toThrow();
  });

  it('parses a featured artist with null digital format and release', () => {
    expect(() =>
      featuredArtistSchema.parse({ ...featuredArtist, digitalFormat: null, release: null })
    ).not.toThrow();
  });
});

describe('releaseCarouselItemSchema', () => {
  it('parses a release carousel item', () => {
    expect(() =>
      releaseCarouselItemSchema.parse({ ...releaseScalar, images: [image] })
    ).not.toThrow();
  });
});

describe('publishedReleaseListingSchema', () => {
  it('parses a published release listing projection', () => {
    expect(() => publishedReleaseListingSchema.parse(publishedReleaseListing)).not.toThrow();
  });

  it('coerces the releasedOn string into a Date', () => {
    expect(publishedReleaseListingSchema.parse(publishedReleaseListing).releasedOn).toBeInstanceOf(
      Date
    );
  });

  it('rejects a listing missing required coverArt', () => {
    const { coverArt: _omit, ...invalid } = publishedReleaseListing;
    expect(() => publishedReleaseListingSchema.parse(invalid)).toThrow();
  });
});

describe('publishedReleaseDetailSchema', () => {
  it('parses a withTracks release detail payload', () => {
    expect(() => publishedReleaseDetailSchema.parse(publishedReleaseDetail)).not.toThrow();
  });

  it('preserves a runtime streamUrl signed onto a digital format file', () => {
    const withStream = {
      ...publishedReleaseDetail,
      digitalFormats: [
        { ...digitalFormat, files: [{ ...digitalFormatFile, streamUrl: 'https://cf/signed' }] },
      ],
    };
    expect(
      publishedReleaseDetailSchema.parse(withStream).digitalFormats[0].files[0].streamUrl
    ).toBe('https://cf/signed');
  });
});

describe('artistWithPublishedReleasesSchema', () => {
  it('parses an artist-with-releases payload including the members relation', () => {
    expect(() =>
      artistWithPublishedReleasesSchema.parse(artistWithPublishedReleases)
    ).not.toThrow();
  });

  // Guards the regression where the route's Prisma include omitted `members`
  // while the schema required it, failing client-side validation on every visit.
  it('rejects a payload missing the members relation', () => {
    const { members: _omit, ...invalid } = artistWithPublishedReleases;
    expect(() => artistWithPublishedReleasesSchema.parse(invalid)).toThrow();
  });
});
