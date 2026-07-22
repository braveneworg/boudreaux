/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared wire-shape fixtures for the media schema specs. The composite fixtures
 * (artist, release, featuredArtist, …) embed the scalar fixtures, so they live
 * together here rather than being duplicated across the per-entity spec files.
 */

export const ISO = '2024-01-02T03:04:05.000Z';

/** Full `Image` scalar wire shape. */
export const image = {
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
export const url = {
  id: 'u1',
  artistId: 'a1',
  releaseId: null,
  platform: 'SPOTIFY',
  url: 'https://x',
};

/** All `Artist` scalars — a mix of populated and null date/string fields to
 * exercise both the coercion and the nullable branches. */
export const artistScalar = {
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
  bioStatus: null,
  bioError: null,
  bioStartedAt: null,
  bioJobToken: null,
  bioProgress: null,
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
export const releaseScalar = {
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
export const digitalFormatFile = {
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

export const digitalFormat = {
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

export const artist = {
  ...artistScalar,
  images: [image],
  labels: [{ id: 'al1', artistId: 'a1', labelId: 'l1' }],
  releases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', release: releaseScalar }],
  urls: [url],
};

export const release = {
  ...releaseScalar,
  images: [image],
  artistReleases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', artist: artistScalar }],
  digitalFormats: [digitalFormat],
  releaseUrls: [{ id: 'ru1', releaseId: 'r1', urlId: 'u1', url }],
};

export const featuredArtist = {
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
  artists: [{ ...artistScalar, bioImages: [{ url: 'https://cdn.example.com/bio.jpg' }] }],
  digitalFormat,
  release: {
    ...releaseScalar,
    images: [image],
    artistReleases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', artist: artistScalar }],
  },
};

export const publishedReleaseListing = {
  id: 'r1',
  title: 'Midnight',
  coverArt: 'cover.jpg',
  releasedOn: ISO,
  images: [{ src: null, altText: null }],
  artistReleases: [
    {
      artist: { id: 'a1', firstName: 'John', surname: 'Doe', displayName: null, slug: 'john-doe' },
    },
  ],
  releaseUrls: [{ url: { platform: 'BANDCAMP', url: 'https://bc' } }],
};

/** Narrowed artist projection on the media-player release-detail page. */
export const releaseDetailArtist = {
  id: 'a1',
  firstName: 'John',
  middleName: 'Q',
  surname: 'Doe',
  displayName: null,
  title: null,
  suffix: null,
};

/** `PublishedReleaseDetail` wire shape — the `withTracks` release payload. */
export const publishedReleaseDetail = {
  ...releaseScalar,
  images: [image],
  artistReleases: [{ artist: releaseDetailArtist }],
  digitalFormats: [digitalFormat],
  releaseUrls: [{ id: 'ru1', releaseId: 'r1', urlId: 'u1', url }],
};

/** `ArtistWithPublishedReleases` wire shape — the artist detail page payload. */
export const artistWithPublishedReleases = {
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
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
      originalUrl: null,
      width: 1200,
      height: 800,
      isPrimary: true,
      kind: null,
      alt: null,
      hasFace: true,
      faceScore: 97.4,
      origin: 'generated',
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
      origin: 'generated',
      sortOrder: 0,
    },
  ],
  members: [{ id: 'am1', artistId: 'a1', memberId: 'a2', member: { ...artistScalar, id: 'a2' } }],
  releases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', release }],
};
