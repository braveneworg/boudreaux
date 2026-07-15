/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  MAX_PLAYLIST_COVER_IMAGE_BYTES,
  MAX_PLAYLIST_COVER_IMAGES,
  MAX_PLAYLIST_ITEMS,
} from '@/lib/constants/playlists';

import {
  addPlaylistItemInputSchema,
  coverImagesSchema,
  createPlaylistInputSchema,
  playlistCoverUploadInputSchema,
  playlistDetailResponseSchema,
  playlistItemPayloadSchema,
  playlistItemSourceRefSchema,
  playlistListRowSchema,
  playlistSearchItemSchema,
  playlistSearchResponseSchema,
  playlistTitleSchema,
  playlistsResponseSchema,
  reorderPlaylistItemsInputSchema,
  updatePlaylistInputSchema,
} from './playlist-schema';

const VALID_OID = 'a1b2c3d4e5f6a1b2c3d4e5f6';

// ---------------------------------------------------------------------------
// playlistTitleSchema
// ---------------------------------------------------------------------------
describe('playlistTitleSchema', () => {
  it('accepts a normal title', () => {
    expect(playlistTitleSchema.safeParse('My Playlist').success).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const result = playlistTitleSchema.safeParse('  My Playlist  ');
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe('My Playlist');
  });

  it('rejects an empty string', () => {
    expect(playlistTitleSchema.safeParse('').success).toBe(false);
  });

  it('rejects a string of only whitespace', () => {
    expect(playlistTitleSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects a string of 121 characters', () => {
    expect(playlistTitleSchema.safeParse('a'.repeat(121)).success).toBe(false);
  });

  it('accepts a string of exactly 120 characters', () => {
    expect(playlistTitleSchema.safeParse('a'.repeat(120)).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// coverImagesSchema
// ---------------------------------------------------------------------------
describe('coverImagesSchema', () => {
  it('accepts an empty array', () => {
    expect(coverImagesSchema.safeParse([]).success).toBe(true);
  });

  it(`accepts ${MAX_PLAYLIST_COVER_IMAGES} URLs`, () => {
    const urls = Array.from(
      { length: MAX_PLAYLIST_COVER_IMAGES },
      (_, i) => `https://cdn.example.com/img${i}.jpg`
    );
    expect(coverImagesSchema.safeParse(urls).success).toBe(true);
  });

  it(`rejects ${MAX_PLAYLIST_COVER_IMAGES + 1} entries`, () => {
    const urls = Array.from(
      { length: MAX_PLAYLIST_COVER_IMAGES + 1 },
      (_, i) => `https://cdn.example.com/img${i}.jpg`
    );
    expect(coverImagesSchema.safeParse(urls).success).toBe(false);
  });

  it('rejects an entry that is an empty string', () => {
    expect(coverImagesSchema.safeParse(['']).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// playlistItemSourceRefSchema
// ---------------------------------------------------------------------------
describe('playlistItemSourceRefSchema', () => {
  it('accepts a valid track ref', () => {
    expect(
      playlistItemSourceRefSchema.safeParse({ itemType: 'track', trackFileId: VALID_OID }).success
    ).toBe(true);
  });

  it('accepts a valid video ref', () => {
    expect(
      playlistItemSourceRefSchema.safeParse({ itemType: 'video', videoId: VALID_OID }).success
    ).toBe(true);
  });

  it('rejects a track ref without trackFileId', () => {
    expect(playlistItemSourceRefSchema.safeParse({ itemType: 'track' }).success).toBe(false);
  });

  it('rejects a video ref with trackFileId instead of videoId', () => {
    expect(
      playlistItemSourceRefSchema.safeParse({ itemType: 'video', trackFileId: VALID_OID }).success
    ).toBe(false);
  });

  it('rejects a track ref with a malformed ObjectId', () => {
    expect(
      playlistItemSourceRefSchema.safeParse({ itemType: 'track', trackFileId: 'bad-id' }).success
    ).toBe(false);
  });

  it('rejects an unknown itemType', () => {
    expect(
      playlistItemSourceRefSchema.safeParse({ itemType: 'album', trackFileId: VALID_OID }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createPlaylistInputSchema
// ---------------------------------------------------------------------------
describe('createPlaylistInputSchema', () => {
  it('accepts a minimal valid input', () => {
    expect(
      createPlaylistInputSchema.safeParse({ title: 'My Playlist', isPublic: false }).success
    ).toBe(true);
  });

  it('defaults coverImages to an empty array', () => {
    const result = createPlaylistInputSchema.safeParse({ title: 'My Playlist', isPublic: false });
    expect(result.success).toBe(true);
    expect(result.success && result.data.coverImages).toEqual([]);
  });

  it('defaults items to an empty array', () => {
    const result = createPlaylistInputSchema.safeParse({ title: 'My Playlist', isPublic: false });
    expect(result.success).toBe(true);
    expect(result.success && result.data.items).toEqual([]);
  });

  it('accepts items up to the max', () => {
    const items = Array.from({ length: MAX_PLAYLIST_ITEMS }, () => ({
      itemType: 'track' as const,
      trackFileId: VALID_OID,
    }));
    expect(
      createPlaylistInputSchema.safeParse({ title: 'My Playlist', isPublic: false, items }).success
    ).toBe(true);
  });

  it('rejects items exceeding the max', () => {
    const items = Array.from({ length: MAX_PLAYLIST_ITEMS + 1 }, () => ({
      itemType: 'track' as const,
      trackFileId: VALID_OID,
    }));
    expect(
      createPlaylistInputSchema.safeParse({ title: 'My Playlist', isPublic: false, items }).success
    ).toBe(false);
  });

  it('rejects missing title', () => {
    expect(createPlaylistInputSchema.safeParse({ isPublic: false }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updatePlaylistInputSchema
// ---------------------------------------------------------------------------
describe('updatePlaylistInputSchema', () => {
  it('accepts updating only the title', () => {
    expect(
      updatePlaylistInputSchema.safeParse({ playlistId: VALID_OID, title: 'New Title' }).success
    ).toBe(true);
  });

  it('accepts updating only isPublic', () => {
    expect(
      updatePlaylistInputSchema.safeParse({ playlistId: VALID_OID, isPublic: true }).success
    ).toBe(true);
  });

  it('accepts updating only coverImages', () => {
    expect(
      updatePlaylistInputSchema.safeParse({ playlistId: VALID_OID, coverImages: [] }).success
    ).toBe(true);
  });

  it('accepts updating all mutable fields at once', () => {
    expect(
      updatePlaylistInputSchema.safeParse({
        playlistId: VALID_OID,
        title: 'New Title',
        isPublic: true,
        coverImages: ['https://cdn.example.com/img.jpg'],
      }).success
    ).toBe(true);
  });

  it('rejects when no mutable field is provided', () => {
    expect(updatePlaylistInputSchema.safeParse({ playlistId: VALID_OID }).success).toBe(false);
  });

  it('rejects a malformed playlistId', () => {
    expect(updatePlaylistInputSchema.safeParse({ playlistId: 'bad-id', title: 'T' }).success).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// addPlaylistItemInputSchema
// ---------------------------------------------------------------------------
describe('addPlaylistItemInputSchema', () => {
  it('accepts a valid track item add', () => {
    expect(
      addPlaylistItemInputSchema.safeParse({
        playlistId: VALID_OID,
        itemType: 'track',
        trackFileId: VALID_OID,
      }).success
    ).toBe(true);
  });

  it('defaults force to false', () => {
    const result = addPlaylistItemInputSchema.safeParse({
      playlistId: VALID_OID,
      itemType: 'track',
      trackFileId: VALID_OID,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.force).toBe(false);
  });

  it('accepts force: true', () => {
    const result = addPlaylistItemInputSchema.safeParse({
      playlistId: VALID_OID,
      itemType: 'track',
      trackFileId: VALID_OID,
      force: true,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.force).toBe(true);
  });

  it('rejects a video item without videoId', () => {
    expect(
      addPlaylistItemInputSchema.safeParse({
        playlistId: VALID_OID,
        itemType: 'video',
      }).success
    ).toBe(false);
  });

  it('accepts a valid video item add with force defaulting to false', () => {
    const result = addPlaylistItemInputSchema.safeParse({
      playlistId: VALID_OID,
      itemType: 'video',
      videoId: VALID_OID,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.force).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reorderPlaylistItemsInputSchema
// ---------------------------------------------------------------------------
describe('reorderPlaylistItemsInputSchema', () => {
  it('accepts a valid ordered list of ids', () => {
    const orderedItemIds = [VALID_OID, 'b2c3d4e5f6a1b2c3d4e5f6a1'];
    expect(
      reorderPlaylistItemsInputSchema.safeParse({ playlistId: VALID_OID, orderedItemIds }).success
    ).toBe(true);
  });

  it('rejects an empty orderedItemIds array', () => {
    expect(
      reorderPlaylistItemsInputSchema.safeParse({ playlistId: VALID_OID, orderedItemIds: [] })
        .success
    ).toBe(false);
  });

  it(`rejects more than ${MAX_PLAYLIST_ITEMS} items`, () => {
    const orderedItemIds = Array.from({ length: MAX_PLAYLIST_ITEMS + 1 }, (_, i) =>
      i.toString(16).padStart(24, '0')
    );
    expect(
      reorderPlaylistItemsInputSchema.safeParse({ playlistId: VALID_OID, orderedItemIds }).success
    ).toBe(false);
  });

  it('rejects duplicate ids', () => {
    expect(
      reorderPlaylistItemsInputSchema.safeParse({
        playlistId: VALID_OID,
        orderedItemIds: [VALID_OID, VALID_OID],
      }).success
    ).toBe(false);
  });

  it('rejects a malformed id inside orderedItemIds', () => {
    expect(
      reorderPlaylistItemsInputSchema.safeParse({
        playlistId: VALID_OID,
        orderedItemIds: ['bad-id'],
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// playlistCoverUploadInputSchema
// ---------------------------------------------------------------------------
describe('playlistCoverUploadInputSchema', () => {
  const validFile = {
    fileName: 'cover.jpg',
    contentType: 'image/jpeg' as const,
    fileSize: 1024,
  };

  it('accepts a valid upload input', () => {
    expect(
      playlistCoverUploadInputSchema.safeParse({ playlistId: VALID_OID, files: [validFile] })
        .success
    ).toBe(true);
  });

  it('rejects image/svg+xml content type', () => {
    expect(
      playlistCoverUploadInputSchema.safeParse({
        playlistId: VALID_OID,
        files: [{ ...validFile, contentType: 'image/svg+xml' }],
      }).success
    ).toBe(false);
  });

  it(`rejects a file exceeding ${MAX_PLAYLIST_COVER_IMAGE_BYTES} bytes (11 MB)`, () => {
    expect(
      playlistCoverUploadInputSchema.safeParse({
        playlistId: VALID_OID,
        files: [{ ...validFile, fileSize: 11 * 1024 * 1024 }],
      }).success
    ).toBe(false);
  });

  it('rejects 5 files (max is 4)', () => {
    const files = Array.from({ length: 5 }, () => validFile);
    expect(playlistCoverUploadInputSchema.safeParse({ playlistId: VALID_OID, files }).success).toBe(
      false
    );
  });

  it('rejects an empty files array', () => {
    expect(
      playlistCoverUploadInputSchema.safeParse({ playlistId: VALID_OID, files: [] }).success
    ).toBe(false);
  });

  it('accepts image/png content type', () => {
    expect(
      playlistCoverUploadInputSchema.safeParse({
        playlistId: VALID_OID,
        files: [{ ...validFile, contentType: 'image/png' }],
      }).success
    ).toBe(true);
  });

  it('accepts image/webp content type', () => {
    expect(
      playlistCoverUploadInputSchema.safeParse({
        playlistId: VALID_OID,
        files: [{ ...validFile, contentType: 'image/webp' }],
      }).success
    ).toBe(true);
  });

  it('accepts image/gif content type', () => {
    expect(
      playlistCoverUploadInputSchema.safeParse({
        playlistId: VALID_OID,
        files: [{ ...validFile, contentType: 'image/gif' }],
      }).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Response schemas — round-trip fixtures
// ---------------------------------------------------------------------------

const validPlaylistListRow = {
  id: VALID_OID,
  title: 'Summer Hits',
  isPublic: true,
  coverImages: ['https://cdn.example.com/img.jpg'],
  itemCount: 12,
  totalDuration: 3600,
  updatedAt: '2024-06-01T00:00:00.000Z',
};

describe('playlistListRowSchema', () => {
  it('round-trips a valid fixture', () => {
    expect(playlistListRowSchema.safeParse(validPlaylistListRow).success).toBe(true);
  });

  it('rejects when id is missing', () => {
    const { id: _id, ...rest } = validPlaylistListRow;
    expect(playlistListRowSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when title is missing', () => {
    const { title: _title, ...rest } = validPlaylistListRow;
    expect(playlistListRowSchema.safeParse(rest).success).toBe(false);
  });
});

describe('playlistsResponseSchema', () => {
  it('round-trips a valid fixture', () => {
    expect(
      playlistsResponseSchema.safeParse({ rows: [validPlaylistListRow], nextSkip: null }).success
    ).toBe(true);
  });

  it('rejects when rows is missing', () => {
    expect(playlistsResponseSchema.safeParse({ nextSkip: null }).success).toBe(false);
  });
});

const validPlaylistItemPayload = {
  id: VALID_OID,
  itemType: 'track',
  sortOrder: 0,
  title: 'Track Title',
  artistName: 'Artist Name',
  duration: 210,
  available: true,
  trackFileId: VALID_OID,
  releaseId: VALID_OID,
  releaseTitle: 'Album Name',
  videoId: null,
  coverArt: 'https://cdn.example.com/art.jpg',
};

describe('playlistItemPayloadSchema', () => {
  it('round-trips a valid track item fixture', () => {
    expect(playlistItemPayloadSchema.safeParse(validPlaylistItemPayload).success).toBe(true);
  });

  it('round-trips a valid video item fixture', () => {
    const videoItem = {
      id: VALID_OID,
      itemType: 'video',
      sortOrder: 1,
      title: 'Video Title',
      artistName: 'Artist Name',
      duration: 310,
      available: true,
      trackFileId: null,
      releaseId: null,
      releaseTitle: null,
      videoId: VALID_OID,
      coverArt: 'https://cdn.example.com/poster.jpg',
    };
    expect(playlistItemPayloadSchema.safeParse(videoItem).success).toBe(true);
  });

  it('rejects when id is missing', () => {
    const { id: _id, ...rest } = validPlaylistItemPayload;
    expect(playlistItemPayloadSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when available is missing', () => {
    const { available: _available, ...rest } = validPlaylistItemPayload;
    expect(playlistItemPayloadSchema.safeParse(rest).success).toBe(false);
  });
});

const validPlaylistDetailResponse = {
  id: VALID_OID,
  title: 'My Playlist',
  isPublic: false,
  isOwner: true,
  coverImages: [],
  itemCount: 1,
  totalDuration: 210,
  items: [validPlaylistItemPayload],
};

describe('playlistDetailResponseSchema', () => {
  it('round-trips a valid fixture', () => {
    expect(playlistDetailResponseSchema.safeParse(validPlaylistDetailResponse).success).toBe(true);
  });

  it('rejects when isOwner is missing', () => {
    const { isOwner: _isOwner, ...rest } = validPlaylistDetailResponse;
    expect(playlistDetailResponseSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when items is missing', () => {
    const { items: _items, ...rest } = validPlaylistDetailResponse;
    expect(playlistDetailResponseSchema.safeParse(rest).success).toBe(false);
  });
});

const validPlaylistSearchItem = {
  key: 'track-abc123',
  itemType: 'track',
  title: 'Track Title',
  artistName: 'Artist Name',
  coverArt: 'https://cdn.example.com/art.jpg',
  duration: 210,
  source: { trackFileId: VALID_OID, releaseId: VALID_OID },
};

describe('playlistSearchItemSchema', () => {
  it('round-trips a valid track search item', () => {
    expect(playlistSearchItemSchema.safeParse(validPlaylistSearchItem).success).toBe(true);
  });

  it('round-trips a valid video search item', () => {
    const videoItem = {
      key: 'video-abc123',
      itemType: 'video',
      title: 'Video Title',
      artistName: null,
      coverArt: null,
      duration: null,
      source: { videoId: VALID_OID },
    };
    expect(playlistSearchItemSchema.safeParse(videoItem).success).toBe(true);
  });

  it('rejects when key is missing', () => {
    const { key: _key, ...rest } = validPlaylistSearchItem;
    expect(playlistSearchItemSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when source is missing', () => {
    const { source: _source, ...rest } = validPlaylistSearchItem;
    expect(playlistSearchItemSchema.safeParse(rest).success).toBe(false);
  });
});

describe('playlistSearchResponseSchema', () => {
  it('round-trips a valid fixture', () => {
    const fixture = {
      groups: [
        {
          key: 'songs',
          label: 'Songs',
          items: [validPlaylistSearchItem],
        },
      ],
    };
    expect(playlistSearchResponseSchema.safeParse(fixture).success).toBe(true);
  });

  it('rejects when groups is missing', () => {
    expect(playlistSearchResponseSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid group key', () => {
    const fixture = {
      groups: [{ key: 'unknown', label: 'Unknown', items: [] }],
    };
    expect(playlistSearchResponseSchema.safeParse(fixture).success).toBe(false);
  });
});
