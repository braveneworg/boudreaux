const FORMATS = {
  // Use AI to expand this list as needed
  DIGITAL: 'DIGITAL',
  MP3_320KBPS: 'MP3_320KBPS',
  MP3_256KBPS: 'MP3_256KBPS',
  MP3_192KBPS: 'MP3_192KBPS',
  MP3_128KBPS: 'MP3_128KBPS',
  FLAC: 'FLAC',
  ALAC: 'ALAC',
  WAV: 'WAV',
  AIFF: 'AIFF',
  AAC: 'AAC',
  OGG_VORBIS: 'OGG_VORBIS',
  WMA: 'WMA',
  CD: 'CD',
  VINYL: 'VINYL',
  VINYL_7_INCH: 'VINYL_7_INCH',
  VINYL_10_INCH: 'VINYL_10_INCH',
  VINYL_12_INCH: 'VINYL_12_INCH',
  VINYL_180G: 'VINYL_180G',
  VINYL_COLORED: 'VINYL_COLORED',
  VINYL_PICTURE_DISC: 'VINYL_PICTURE_DISC',
  VINYL_GATEFOLD: 'VINYL_GATEFOLD',
  VINYL_SPLATTERED: 'VINYL_SPLATTERED',
  VINYL_ETCHED: 'VINYL_ETCHED',
  VINYL_45RPM: 'VINYL_45RPM',
  VINYL_33RPM: 'VINYL_33RPM',
  VINYL_TRANSPARENT: 'VINYL_TRANSPARENT',
  VINYL_DOUBLE_LP: 'VINYL_DOUBLE_LP',
  VINYL_TRIPLE_LP: 'VINYL_TRIPLE_LP',
  VINYL_QUAD_LP: 'VINYL_QUAD_LP',
  CASSETTE: 'CASSETTE',
  VIDEO: 'VIDEO',
  OTHER: 'OTHER',
} as const;

type Format = (typeof FORMATS)[keyof typeof FORMATS];

interface Identity {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
  publishedAt?: Date;
}

interface MediaEntity extends Identity {
  images: Image[]; // Must have at least one image
}

interface Image {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
  caption?: string;
}

interface ArtistRelease {
  id: string;
  artist: Artist;
  artistId: string;
  release: Release;
  releaseId: string;
}

interface Release extends MediaEntity {
  title: string;
  labels?: string[]; // Defaults to "Fake Four Inc." if not specified; maybe there could be more than one label associated with a release, I'm
  formats?: Format[]; // If this isn't specified, assume some basic set of formats available
  releasedOn: Date;
  catalogNumber?: string;
  coverArt?: string;
  downloadUrls?: string[]; // If not specified (yet?), assume streaming only for now;
  formats: Format[]; // This should be the formats available specifically for this release
  extendedData?: Json;
  images: Image[]; // First image is the cover art
  tags?: string[];
  notes?: string[];
  executiveProducedBy?: string[];
  coProducedBy?: string[];
  masteredBy?: string[];
  mixedBy?: string[];
  recordedBy?: string[];
  artBy: string[]; // e.g., Cover Art, Layout, etc.
  designBy?: string[]; // e.g., Andy McAlpine
  photographyBy?: string[]; // e.g., Jane Doe
  linerNotesBy?: string[]; // e.g., John Smith, et al.
  imageTypes?: string[]; // e.g., Cover Photo, Back Cover, Insert, etc.
  releaseTracks: ReleaseTrack[]; // All the tracks on this release
  artistReleases: ArtistRelease[]; // All the artists associated with this release
  releaseUrls: ReleaseUrl[]; // artist, platform, url, etc.
  variants: string[]; // e.g., Deluxe Edition, Remastered, etc.
}

interface Artist {
  displayName: string;
  first: string;
  last: string;
  name: string;
  pics: string[];
  releases: Release[];
  artists: Artist[];
  bandcampUrl: string;
}

interface Url extends MediaEntity {
  artist: Artist;
  artistId: string;
  release?: Release;
  releaseId?: string;
  group?: Group;
  groupId?: string;
  platform: Platform;
  url: string;
  images?: Image[];
}

interface ReleaseUrl extends Identity {
  release: Release;
  releaseId: string;
  url: Url;
  urlId: string;
}

// TODO: Create types that match the models in #src/prisma/schema.prisma, updating any types in this file to match the schema as needed
