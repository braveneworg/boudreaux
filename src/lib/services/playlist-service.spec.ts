/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  MAX_PLAYLIST_ITEMS,
  PLAYLIST_SEARCH_GROUP_LIMIT,
  PLAYLISTS_PAGE_SIZE,
} from '@/lib/constants/playlists';
import { PlaylistRepository } from '@/lib/repositories/playlist-repository';
import type { TrackFileWithRelease } from '@/lib/repositories/release-digital-format-file-repository';
import { VideoRepository } from '@/lib/repositories/video-repository';
import type { VideoSummary } from '@/lib/repositories/video-repository';
import { ArtistService } from '@/lib/services/artist-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { Artist } from '@/lib/types/domain/artist';
import type { PlaylistItemRecord, PlaylistRecord } from '@/lib/types/domain/playlist';
import type { PublishedReleaseDetail, PublishedReleaseListing } from '@/lib/types/domain/release';
import { signStreamUrl } from '@/lib/utils/sign-stream-url';

import { PlaylistService } from './playlist-service';

vi.mock('server-only', () => ({}));

const { trackFileRepoMock } = vi.hoisted(() => ({
  trackFileRepoMock: {
    findManyByIdsWithRelease: vi.fn(),
    searchTracksByTitle: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/playlist-repository', () => ({
  PlaylistRepository: {
    createWithItems: vi.fn(),
    findById: vi.fn(),
    findByIdWithItems: vi.fn(),
    findManyByOwner: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findDuplicateItem: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    reorderItems: vi.fn(),
    searchPublicTrackItems: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/release-digital-format-file-repository', () => ({
  ReleaseDigitalFormatFileRepository: class {
    findManyByIdsWithRelease = trackFileRepoMock.findManyByIdsWithRelease;
    searchTracksByTitle = trackFileRepoMock.searchTracksByTitle;
  },
}));

vi.mock('@/lib/repositories/video-repository', () => ({
  VideoRepository: {
    findManyByIds: vi.fn(),
    searchPublished: vi.fn(),
  },
}));

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getPublishedReleases: vi.fn(),
    getReleaseWithTracks: vi.fn(),
  },
}));

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    searchPublishedArtists: vi.fn(),
  },
}));

vi.mock('@/lib/utils/sign-stream-url', () => ({
  signStreamUrl: vi.fn((s3Key: string | null | undefined) => (s3Key ? `signed:${s3Key}` : null)),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-07-01T12:00:00.000Z');
const OWNER_ID = 'owner-1';
const OTHER_USER_ID = 'user-2';
const PLAYLIST_ID = 'playlist-1';

const makePlaylist = (overrides: Partial<PlaylistRecord> = {}): PlaylistRecord => ({
  id: PLAYLIST_ID,
  ownerId: OWNER_ID,
  title: 'Road Trip',
  isPublic: false,
  coverImages: [],
  itemCount: 2,
  totalDuration: 333,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeItem = (overrides: Partial<PlaylistItemRecord> = {}): PlaylistItemRecord => ({
  id: 'item-1',
  playlistId: PLAYLIST_ID,
  itemType: 'track',
  trackFileId: 'file-1',
  releaseId: 'release-1',
  videoId: null,
  title: 'Snapshot Song',
  artistName: 'Snapshot Artist',
  duration: 111,
  sortOrder: 0,
  addedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

interface TrackFileOptions {
  id?: string;
  title?: string | null;
  fileName?: string;
  duration?: number | null;
  releaseId?: string;
  releaseTitle?: string;
  coverArt?: string;
  publishedAt?: Date | null;
  artists?: Array<{ displayName: string | null; firstName: string; surname: string }>;
}

const TRACK_FILE_DEFAULTS: Required<TrackFileOptions> = {
  id: 'file-1',
  title: 'Live Song',
  fileName: '01-live-song.mp3',
  duration: 215,
  releaseId: 'release-1',
  releaseTitle: 'Live Album',
  coverArt: 'https://cdn.test/covers/release-1.jpg',
  publishedAt: NOW,
  artists: [{ displayName: 'Killah Trakz', firstName: 'Kill', surname: 'Trakz' }],
};

const makeTrackFile = (options: TrackFileOptions = {}): TrackFileWithRelease => {
  const { id, title, fileName, duration, releaseId, releaseTitle, coverArt, publishedAt, artists } =
    { ...TRACK_FILE_DEFAULTS, ...options };
  return {
    id,
    trackNumber: 1,
    title,
    duration,
    s3Key: `releases/${releaseId}/tracks/${fileName}`,
    fileName,
    mimeType: 'audio/mpeg',
    format: {
      formatType: 'MP3_320KBPS',
      releaseId,
      release: {
        id: releaseId,
        title: releaseTitle,
        coverArt,
        publishedAt,
        artistReleases: artists.map((artist) => ({ artist })),
      },
    },
  };
};

const makeVideo = (overrides: Partial<VideoSummary> = {}): VideoSummary => ({
  id: 'video-1',
  title: 'Live Video',
  artist: 'Video Artist',
  durationSeconds: 240,
  posterUrl: 'https://cdn.test/posters/video-1.jpg',
  s3Key: 'videos/video-1.mp4',
  ...overrides,
});

const makeListing = (id: string, title: string): PublishedReleaseListing => ({
  id,
  title,
  coverArt: `https://cdn.test/covers/${id}.jpg`,
  releasedOn: NOW,
  images: [],
  artistReleases: [
    {
      artist: {
        id: 'artist-1',
        firstName: 'Kill',
        surname: 'Trakz',
        displayName: 'Killah Trakz',
        slug: 'killah-trakz',
      },
    },
  ],
  releaseUrls: [],
});

interface DetailFile {
  id: string;
  title?: string | null;
  fileName?: string;
  duration?: number | null;
}

interface DetailFormat {
  formatType?: string;
  files: DetailFile[];
}

const makeReleaseDetail = (
  id: string,
  title: string,
  formats: DetailFormat[]
): PublishedReleaseDetail =>
  ({
    id,
    title,
    coverArt: `https://cdn.test/covers/${id}.jpg`,
    artistReleases: [
      {
        artist: {
          id: 'artist-1',
          firstName: 'Kill',
          middleName: null,
          surname: 'Trakz',
          displayName: 'Killah Trakz',
          title: null,
          suffix: null,
        },
      },
    ],
    digitalFormats: formats.map(({ formatType = 'MP3_320KBPS', files }) => ({
      formatType,
      files: files.map(({ id: fileId, title: fileTitle = `Track ${fileId}`, ...rest }) => ({
        id: fileId,
        title: fileTitle,
        fileName: rest.fileName ?? `${fileId}.mp3`,
        duration: rest.duration ?? 180,
        trackNumber: 1,
      })),
    })),
  }) as unknown as PublishedReleaseDetail;

const makeArtist = (
  displayName: string | null,
  releases: Array<{ id: string; title: string; publishedAt: Date | null; deletedOn: Date | null }>,
  names: { firstName?: string; surname?: string } = {}
): Artist =>
  ({
    displayName,
    firstName: names.firstName ?? 'Kill',
    surname: names.surname ?? 'Trakz',
    releases: releases.map((release) => ({ release })),
  }) as unknown as Artist;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.test');
  trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([]);
  trackFileRepoMock.searchTracksByTitle.mockResolvedValue([]);
  vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([]);
  vi.mocked(VideoRepository.searchPublished).mockResolvedValue([]);
  vi.mocked(PlaylistRepository.searchPublicTrackItems).mockResolvedValue([]);
  vi.mocked(ReleaseService.getPublishedReleases).mockResolvedValue({ success: true, data: [] });
  vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
    success: false,
    error: 'Release not found',
  });
  vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PlaylistService', () => {
  describe('requireOwned', () => {
    it('throws NOT_FOUND when the playlist does not exist', async () => {
      vi.mocked(PlaylistRepository.findById).mockResolvedValue(null);

      await expect(PlaylistService.requireOwned(PLAYLIST_ID, OWNER_ID)).rejects.toMatchObject({
        name: 'DataError',
        code: 'NOT_FOUND',
        message: 'Playlist not found',
      });
    });

    it('throws the same NOT_FOUND for an unowned playlist (no existence leak)', async () => {
      vi.mocked(PlaylistRepository.findById).mockResolvedValue(makePlaylist());

      await expect(PlaylistService.requireOwned(PLAYLIST_ID, OTHER_USER_ID)).rejects.toMatchObject({
        name: 'DataError',
        code: 'NOT_FOUND',
        message: 'Playlist not found',
      });
    });

    it('returns the playlist for its owner', async () => {
      const playlist = makePlaylist();
      vi.mocked(PlaylistRepository.findById).mockResolvedValue(playlist);

      await expect(PlaylistService.requireOwned(PLAYLIST_ID, OWNER_ID)).resolves.toEqual(playlist);
    });
  });

  describe('getOwnedOrPublicDetail', () => {
    const mockPlaylistWithItems = (
      playlistOverrides: Partial<PlaylistRecord>,
      items: PlaylistItemRecord[]
    ): void => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist(playlistOverrides),
        items,
      });
    };

    it('returns null when the playlist is missing', async () => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue(null);

      await expect(
        PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID)
      ).resolves.toBeNull();
    });

    it('returns null for a private playlist requested by a non-owner', async () => {
      mockPlaylistWithItems({ isPublic: false }, []);

      await expect(
        PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OTHER_USER_ID)
      ).resolves.toBeNull();
    });

    it('returns the detail with isOwner true for the owner of a private playlist', async () => {
      mockPlaylistWithItems({ isPublic: false, coverImages: ['https://cdn.test/c.jpg'] }, []);

      await expect(PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID)).resolves.toEqual({
        id: PLAYLIST_ID,
        title: 'Road Trip',
        isPublic: false,
        isOwner: true,
        coverImages: ['https://cdn.test/c.jpg'],
        itemCount: 2,
        totalDuration: 333,
        items: [],
      });
    });

    it('returns the detail with isOwner false for a public playlist viewed by another user', async () => {
      mockPlaylistWithItems({ isPublic: true }, []);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OTHER_USER_ID);

      expect(detail).toMatchObject({ isPublic: true, isOwner: false });
    });

    it('marks a resolvable track item available with live fields and release cover art', async () => {
      mockPlaylistWithItems({}, [makeItem()]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([makeTrackFile()]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toEqual({
        id: 'item-1',
        itemType: 'track',
        sortOrder: 0,
        title: 'Live Song',
        artistName: 'Killah Trakz',
        duration: 215,
        available: true,
        trackFileId: 'file-1',
        releaseId: 'release-1',
        releaseTitle: 'Live Album',
        videoId: null,
        coverArt: 'https://cdn.test/covers/release-1.jpg',
        s3Key: 'releases/release-1/tracks/01-live-song.mp3',
        streamUrl: 'https://cdn.test/releases/release-1/tracks/01-live-song.mp3',
        posterUrl: null,
      });
    });

    it('derives the artist name from first/surname when displayName is null', async () => {
      mockPlaylistWithItems({}, [makeItem()]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ artists: [{ displayName: null, firstName: 'Kill', surname: 'Trakz' }] }),
      ]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]?.artistName).toBe('Kill Trakz');
    });

    it('falls back to snapshot title and duration when the live row has null fields', async () => {
      mockPlaylistWithItems({}, [makeItem()]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ title: null, duration: null }),
      ]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({
        title: 'Snapshot Song',
        duration: 111,
        available: true,
      });
    });

    it('falls back to the snapshot artist name when the live release has no artists', async () => {
      mockPlaylistWithItems({}, [makeItem()]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ artists: [] }),
      ]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]?.artistName).toBe('Snapshot Artist');
    });

    it('marks a track item without a trackFileId unavailable', async () => {
      mockPlaylistWithItems({}, [makeItem({ trackFileId: null })]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({ available: false, title: 'Snapshot Song' });
    });

    it('marks a track item unavailable with snapshots when the file row is gone', async () => {
      mockPlaylistWithItems({}, [makeItem()]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toEqual({
        id: 'item-1',
        itemType: 'track',
        sortOrder: 0,
        title: 'Snapshot Song',
        artistName: 'Snapshot Artist',
        duration: 111,
        available: false,
        trackFileId: 'file-1',
        releaseId: 'release-1',
        releaseTitle: null,
        videoId: null,
        coverArt: null,
        s3Key: null,
        streamUrl: null,
        posterUrl: null,
      });
    });

    it('marks a resolvable video item available with live fields and poster cover art', async () => {
      mockPlaylistWithItems({}, [
        makeItem({
          id: 'item-2',
          itemType: 'video',
          trackFileId: null,
          releaseId: null,
          videoId: 'video-1',
          title: 'Snapshot Video',
          artistName: 'Snapshot V',
          duration: 5,
          sortOrder: 1,
        }),
      ]);
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([makeVideo()]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toEqual({
        id: 'item-2',
        itemType: 'video',
        sortOrder: 1,
        title: 'Live Video',
        artistName: 'Video Artist',
        duration: 240,
        available: true,
        trackFileId: null,
        releaseId: null,
        releaseTitle: null,
        videoId: 'video-1',
        coverArt: 'https://cdn.test/posters/video-1.jpg',
        s3Key: null,
        streamUrl: 'signed:videos/video-1.mp4',
        posterUrl: 'https://cdn.test/posters/video-1.jpg',
      });
    });

    it('falls back to the snapshot duration when the live video has no duration', async () => {
      mockPlaylistWithItems({}, [
        makeItem({
          id: 'item-2',
          itemType: 'video',
          trackFileId: null,
          releaseId: null,
          videoId: 'video-1',
          duration: 5,
        }),
      ]);
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([
        makeVideo({ durationSeconds: null }),
      ]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({ available: true, duration: 5 });
    });

    it('marks a video item without a videoId unavailable', async () => {
      mockPlaylistWithItems({}, [
        makeItem({ id: 'item-2', itemType: 'video', trackFileId: null, videoId: null }),
      ]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({ available: false, title: 'Snapshot Song' });
    });

    it('marks a video item unavailable when the published lookup omits it', async () => {
      mockPlaylistWithItems({}, [
        makeItem({
          id: 'item-2',
          itemType: 'video',
          trackFileId: null,
          releaseId: null,
          videoId: 'video-archived',
          title: 'Snapshot Video',
          artistName: 'Snapshot V',
          duration: 7,
        }),
      ]);
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({
        available: false,
        title: 'Snapshot Video',
        artistName: 'Snapshot V',
        duration: 7,
        coverArt: null,
        releaseTitle: null,
      });
    });
  });

  describe('getOwnedOrPublicDetail stream fields', () => {
    const TRACK_S3_KEY = 'releases/release-1/tracks/01-live-song.mp3';

    const mockDetailItems = (items: PlaylistItemRecord[]): void => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist(),
        items,
      });
    };

    const makeVideoItem = (overrides: Partial<PlaylistItemRecord> = {}): PlaylistItemRecord =>
      makeItem({
        id: 'item-2',
        itemType: 'video',
        trackFileId: null,
        releaseId: null,
        videoId: 'video-1',
        title: 'Snapshot Video',
        artistName: 'Snapshot V',
        duration: 5,
        sortOrder: 1,
        ...overrides,
      });

    it('attaches the raw key and unsigned CDN URL to a resolved track', async () => {
      mockDetailItems([makeItem()]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([makeTrackFile()]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({
        s3Key: TRACK_S3_KEY,
        streamUrl: `https://cdn.test/${TRACK_S3_KEY}`,
        posterUrl: null,
      });
    });

    it('keeps stream fields on a grandfathered track of an unpublished release', async () => {
      mockDetailItems([makeItem()]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ publishedAt: null }),
      ]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({
        available: true,
        s3Key: TRACK_S3_KEY,
        streamUrl: `https://cdn.test/${TRACK_S3_KEY}`,
        posterUrl: null,
      });
    });

    it('attaches a signed URL and poster to a resolved video, never the raw key', async () => {
      mockDetailItems([makeVideoItem()]);
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([makeVideo()]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({
        s3Key: null,
        streamUrl: 'signed:videos/video-1.mp4',
        posterUrl: 'https://cdn.test/posters/video-1.jpg',
      });
      expect(vi.mocked(signStreamUrl).mock.calls).toEqual([['videos/video-1.mp4']]);
    });

    it('leaves all stream fields null for an unavailable track', async () => {
      mockDetailItems([makeItem()]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({ s3Key: null, streamUrl: null, posterUrl: null });
    });

    it('leaves all stream fields null for an unavailable video', async () => {
      mockDetailItems([makeVideoItem({ videoId: 'video-archived' })]);
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([]);

      const detail = await PlaylistService.getOwnedOrPublicDetail(PLAYLIST_ID, OWNER_ID);

      expect(detail?.items[0]).toMatchObject({ s3Key: null, streamUrl: null, posterUrl: null });
    });
  });

  describe('resolveItemSource', () => {
    it('builds track snapshot data from the live row', async () => {
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([makeTrackFile()]);

      await expect(
        PlaylistService.resolveItemSource({ itemType: 'track', trackFileId: 'file-1' })
      ).resolves.toEqual({
        itemType: 'track',
        trackFileId: 'file-1',
        releaseId: 'release-1',
        videoId: null,
        title: 'Live Song',
        artistName: 'Killah Trakz',
        duration: 215,
      });
    });

    it('falls back to the file name and duration 0 when live fields are null', async () => {
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ title: null, duration: null }),
      ]);

      await expect(
        PlaylistService.resolveItemSource({ itemType: 'track', trackFileId: 'file-1' })
      ).resolves.toMatchObject({ title: '01-live-song.mp3', duration: 0 });
    });

    it('resolves an empty artist join list to an empty artist name', async () => {
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ artists: [] }),
      ]);

      await expect(
        PlaylistService.resolveItemSource({ itemType: 'track', trackFileId: 'file-1' })
      ).resolves.toMatchObject({ artistName: '' });
    });

    it('returns null for a track ref without a trackFileId', async () => {
      await expect(PlaylistService.resolveItemSource({ itemType: 'track' })).resolves.toBeNull();
    });

    it('returns null for a video ref without a videoId', async () => {
      await expect(PlaylistService.resolveItemSource({ itemType: 'video' })).resolves.toBeNull();
    });

    it('returns null when the track file row is missing', async () => {
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([]);

      await expect(
        PlaylistService.resolveItemSource({ itemType: 'track', trackFileId: 'file-gone' })
      ).resolves.toBeNull();
    });

    it('returns null when the track release is unpublished', async () => {
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ publishedAt: null }),
      ]);

      await expect(
        PlaylistService.resolveItemSource({ itemType: 'track', trackFileId: 'file-1' })
      ).resolves.toBeNull();
    });

    it('builds video snapshot data from the live row', async () => {
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([makeVideo()]);

      await expect(
        PlaylistService.resolveItemSource({ itemType: 'video', videoId: 'video-1' })
      ).resolves.toEqual({
        itemType: 'video',
        trackFileId: null,
        releaseId: null,
        videoId: 'video-1',
        title: 'Live Video',
        artistName: 'Video Artist',
        duration: 240,
      });
    });

    it('defaults the video duration to 0 when durationSeconds is null', async () => {
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([
        makeVideo({ durationSeconds: null }),
      ]);

      await expect(
        PlaylistService.resolveItemSource({ itemType: 'video', videoId: 'video-1' })
      ).resolves.toMatchObject({ duration: 0 });
    });

    it('returns null when the video is not in the published lookup', async () => {
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([]);

      await expect(
        PlaylistService.resolveItemSource({ itemType: 'video', videoId: 'video-archived' })
      ).resolves.toBeNull();
    });
  });

  describe('createWithItems', () => {
    const mockCreatedDetail = (): void => {
      vi.mocked(PlaylistRepository.createWithItems).mockResolvedValue(
        makePlaylist({ id: 'playlist-new' })
      );
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist({ id: 'playlist-new' }),
        items: [],
      });
    };

    it('drops unresolvable refs and seeds only the resolved items', async () => {
      mockCreatedDetail();
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([makeTrackFile()]);
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([makeVideo()]);

      await PlaylistService.createWithItems(OWNER_ID, {
        title: 'New Mix',
        isPublic: false,
        coverImages: [],
        items: [
          { itemType: 'track', trackFileId: 'file-1' },
          { itemType: 'track', trackFileId: 'file-gone' },
          { itemType: 'video', videoId: 'video-1' },
        ],
      });

      expect(vi.mocked(PlaylistRepository.createWithItems)).toHaveBeenCalledWith(
        { ownerId: OWNER_ID, title: 'New Mix', isPublic: false, coverImages: [] },
        [
          expect.objectContaining({ itemType: 'track', trackFileId: 'file-1' }),
          expect.objectContaining({ itemType: 'video', videoId: 'video-1' }),
        ]
      );
    });

    it('returns the created playlist through the detail path', async () => {
      mockCreatedDetail();

      const detail = await PlaylistService.createWithItems(OWNER_ID, {
        title: 'New Mix',
        isPublic: false,
        coverImages: [],
        items: [],
      });

      expect(detail).toMatchObject({ id: 'playlist-new', isOwner: true, items: [] });
    });

    it('seeds an item whose source has no artwork', async () => {
      mockCreatedDetail();
      vi.mocked(VideoRepository.findManyByIds).mockResolvedValue([makeVideo({ posterUrl: null })]);

      await PlaylistService.createWithItems(OWNER_ID, {
        title: 'New Mix',
        isPublic: false,
        coverImages: [],
        items: [{ itemType: 'video', videoId: 'video-1' }],
      });

      expect(vi.mocked(PlaylistRepository.createWithItems)).toHaveBeenCalledWith(
        expect.anything(),
        [expect.objectContaining({ itemType: 'video', videoId: 'video-1' })]
      );
    });

    it('throws NOT_FOUND when the created playlist cannot be reloaded', async () => {
      vi.mocked(PlaylistRepository.createWithItems).mockResolvedValue(
        makePlaylist({ id: 'playlist-new' })
      );
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue(null);

      await expect(
        PlaylistService.createWithItems(OWNER_ID, {
          title: 'New Mix',
          isPublic: false,
          coverImages: [],
          items: [],
        })
      ).rejects.toMatchObject({ name: 'DataError', code: 'NOT_FOUND' });
    });

    it('accepts a cover image that matches resolved item artwork', async () => {
      mockCreatedDetail();
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([makeTrackFile()]);

      await PlaylistService.createWithItems(OWNER_ID, {
        title: 'New Mix',
        isPublic: true,
        coverImages: ['https://cdn.test/covers/release-1.jpg'],
        items: [{ itemType: 'track', trackFileId: 'file-1' }],
      });

      expect(vi.mocked(PlaylistRepository.createWithItems)).toHaveBeenCalledWith(
        expect.objectContaining({ coverImages: ['https://cdn.test/covers/release-1.jpg'] }),
        expect.anything()
      );
    });

    it('rejects a cover image that is neither item art nor an uploaded cover', async () => {
      mockCreatedDetail();

      await expect(
        PlaylistService.createWithItems(OWNER_ID, {
          title: 'New Mix',
          isPublic: false,
          coverImages: ['https://evil.test/steal.jpg'],
          items: [],
        })
      ).rejects.toMatchObject({ name: 'DataError', code: 'INVALID_INPUT' });
    });

    it('rejects playlist-prefix covers at create time (no playlist id exists yet)', async () => {
      mockCreatedDetail();

      await expect(
        PlaylistService.createWithItems(OWNER_ID, {
          title: 'New Mix',
          isPublic: false,
          coverImages: ['https://cdn.test/media/playlists/playlist-x/cover.webp'],
          items: [],
        })
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('does not create the playlist when a cover image is invalid', async () => {
      mockCreatedDetail();

      await PlaylistService.createWithItems(OWNER_ID, {
        title: 'New Mix',
        isPublic: false,
        coverImages: ['https://evil.test/steal.jpg'],
        items: [],
      }).catch(() => undefined);

      expect(vi.mocked(PlaylistRepository.createWithItems)).not.toHaveBeenCalled();
    });
  });

  describe('addItem', () => {
    const trackRef = { itemType: 'track' as const, trackFileId: 'file-1' };

    const mockOwnedPlaylist = (overrides: Partial<PlaylistRecord> = {}): void => {
      vi.mocked(PlaylistRepository.findById).mockResolvedValue(makePlaylist(overrides));
    };

    beforeEach(() => {
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([makeTrackFile()]);
      vi.mocked(PlaylistRepository.findDuplicateItem).mockResolvedValue(null);
      vi.mocked(PlaylistRepository.addItem).mockResolvedValue(
        makeItem({ id: 'item-new', title: 'Live Song', artistName: 'Killah Trakz', duration: 215 })
      );
    });

    it('throws NOT_FOUND for an unowned playlist', async () => {
      mockOwnedPlaylist({ ownerId: 'someone-else' });

      await expect(
        PlaylistService.addItem(OWNER_ID, { playlistId: PLAYLIST_ID, ref: trackRef, force: false })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws NOT_FOUND when the source cannot be resolved', async () => {
      mockOwnedPlaylist();
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([]);

      await expect(
        PlaylistService.addItem(OWNER_ID, { playlistId: PLAYLIST_ID, ref: trackRef, force: false })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('returns duplicate: true when the source already exists and force is false', async () => {
      mockOwnedPlaylist();
      vi.mocked(PlaylistRepository.findDuplicateItem).mockResolvedValue(makeItem());

      await expect(
        PlaylistService.addItem(OWNER_ID, { playlistId: PLAYLIST_ID, ref: trackRef, force: false })
      ).resolves.toEqual({ duplicate: true });
    });

    it('does not add the item when reporting a duplicate', async () => {
      mockOwnedPlaylist();
      vi.mocked(PlaylistRepository.findDuplicateItem).mockResolvedValue(makeItem());

      await PlaylistService.addItem(OWNER_ID, {
        playlistId: PLAYLIST_ID,
        ref: trackRef,
        force: false,
      });

      expect(vi.mocked(PlaylistRepository.addItem)).not.toHaveBeenCalled();
    });

    it('reports the duplicate before enforcing the item limit', async () => {
      mockOwnedPlaylist({ itemCount: MAX_PLAYLIST_ITEMS });
      vi.mocked(PlaylistRepository.findDuplicateItem).mockResolvedValue(makeItem());

      await expect(
        PlaylistService.addItem(OWNER_ID, { playlistId: PLAYLIST_ID, ref: trackRef, force: false })
      ).resolves.toEqual({ duplicate: true });
    });

    it('skips the duplicate lookup when force is true', async () => {
      mockOwnedPlaylist();

      await PlaylistService.addItem(OWNER_ID, {
        playlistId: PLAYLIST_ID,
        ref: trackRef,
        force: true,
      });

      expect(vi.mocked(PlaylistRepository.findDuplicateItem)).not.toHaveBeenCalled();
    });

    it('throws LIMIT_EXCEEDED when the playlist is full', async () => {
      mockOwnedPlaylist({ itemCount: MAX_PLAYLIST_ITEMS });

      await expect(
        PlaylistService.addItem(OWNER_ID, { playlistId: PLAYLIST_ID, ref: trackRef, force: false })
      ).rejects.toMatchObject({ name: 'DataError', code: 'LIMIT_EXCEEDED' });
    });

    it('persists the snapshot built from the live source row', async () => {
      mockOwnedPlaylist();

      await PlaylistService.addItem(OWNER_ID, {
        playlistId: PLAYLIST_ID,
        ref: trackRef,
        force: false,
      });

      expect(vi.mocked(PlaylistRepository.addItem)).toHaveBeenCalledWith(PLAYLIST_ID, {
        itemType: 'track',
        trackFileId: 'file-1',
        releaseId: 'release-1',
        videoId: null,
        title: 'Live Song',
        artistName: 'Killah Trakz',
        duration: 215,
      });
    });

    it('returns the created item as an available payload with live cover art', async () => {
      mockOwnedPlaylist();

      const result = await PlaylistService.addItem(OWNER_ID, {
        playlistId: PLAYLIST_ID,
        ref: trackRef,
        force: false,
      });

      expect(result).toEqual({
        duplicate: false,
        item: {
          id: 'item-new',
          itemType: 'track',
          sortOrder: 0,
          title: 'Live Song',
          artistName: 'Killah Trakz',
          duration: 215,
          available: true,
          trackFileId: 'file-1',
          releaseId: 'release-1',
          releaseTitle: 'Live Album',
          videoId: null,
          coverArt: 'https://cdn.test/covers/release-1.jpg',
          s3Key: 'releases/release-1/tracks/01-live-song.mp3',
          streamUrl: 'https://cdn.test/releases/release-1/tracks/01-live-song.mp3',
          posterUrl: null,
        },
      });
    });

    it('carries the track stream fields on the created item', async () => {
      mockOwnedPlaylist();

      const result = await PlaylistService.addItem(OWNER_ID, {
        playlistId: PLAYLIST_ID,
        ref: trackRef,
        force: false,
      });

      expect(result).toMatchObject({
        duplicate: false,
        item: {
          s3Key: 'releases/release-1/tracks/01-live-song.mp3',
          streamUrl: 'https://cdn.test/releases/release-1/tracks/01-live-song.mp3',
          posterUrl: null,
        },
      });
    });
  });

  describe('removeItem', () => {
    const mockOwnedWithItems = (items: PlaylistItemRecord[]): void => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist(),
        items,
      });
    };

    it('throws NOT_FOUND for an unowned playlist', async () => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist({ ownerId: 'someone-else' }),
        items: [makeItem()],
      });

      await expect(
        PlaylistService.removeItem(OWNER_ID, PLAYLIST_ID, 'item-1')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws NOT_FOUND when the item does not belong to the playlist', async () => {
      mockOwnedWithItems([makeItem({ id: 'item-1' })]);

      await expect(
        PlaylistService.removeItem(OWNER_ID, PLAYLIST_ID, 'item-of-another-playlist')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('removes an item that belongs to the owned playlist', async () => {
      mockOwnedWithItems([makeItem({ id: 'item-1' })]);

      await PlaylistService.removeItem(OWNER_ID, PLAYLIST_ID, 'item-1');

      expect(vi.mocked(PlaylistRepository.removeItem)).toHaveBeenCalledWith(PLAYLIST_ID, 'item-1');
    });
  });

  describe('reorder', () => {
    const mockOwnedWithItems = (itemIds: string[]): void => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist(),
        items: itemIds.map((id, index) => makeItem({ id, sortOrder: index })),
      });
    };

    it('throws NOT_FOUND for an unowned playlist', async () => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist({ ownerId: 'someone-else' }),
        items: [],
      });

      await expect(PlaylistService.reorder(OWNER_ID, PLAYLIST_ID, [])).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('throws INVALID_INPUT when an item id is missing from the list', async () => {
      mockOwnedWithItems(['item-1', 'item-2']);

      await expect(
        PlaylistService.reorder(OWNER_ID, PLAYLIST_ID, ['item-1'])
      ).rejects.toMatchObject({ name: 'DataError', code: 'INVALID_INPUT' });
    });

    it('throws INVALID_INPUT when the list contains a foreign item id', async () => {
      mockOwnedWithItems(['item-1', 'item-2']);

      await expect(
        PlaylistService.reorder(OWNER_ID, PLAYLIST_ID, ['item-1', 'item-x'])
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('throws INVALID_INPUT when the list repeats an id', async () => {
      mockOwnedWithItems(['item-1', 'item-2']);

      await expect(
        PlaylistService.reorder(OWNER_ID, PLAYLIST_ID, ['item-1', 'item-1'])
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('reorders when the id set matches in a different order', async () => {
      mockOwnedWithItems(['item-1', 'item-2']);

      await PlaylistService.reorder(OWNER_ID, PLAYLIST_ID, ['item-2', 'item-1']);

      expect(vi.mocked(PlaylistRepository.reorderItems)).toHaveBeenCalledWith(PLAYLIST_ID, [
        'item-2',
        'item-1',
      ]);
    });
  });

  describe('update', () => {
    it('throws NOT_FOUND for an unowned playlist', async () => {
      vi.mocked(PlaylistRepository.findById).mockResolvedValue(
        makePlaylist({ ownerId: 'someone-else' })
      );

      await expect(
        PlaylistService.update(OWNER_ID, { playlistId: PLAYLIST_ID, title: 'Renamed' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('updates scalar fields without resolving items when covers are untouched', async () => {
      vi.mocked(PlaylistRepository.findById).mockResolvedValue(makePlaylist());
      vi.mocked(PlaylistRepository.update).mockResolvedValue(makePlaylist({ title: 'Renamed' }));

      await PlaylistService.update(OWNER_ID, { playlistId: PLAYLIST_ID, title: 'Renamed' });

      expect(vi.mocked(PlaylistRepository.update)).toHaveBeenCalledWith(PLAYLIST_ID, {
        title: 'Renamed',
      });
    });

    it('accepts cover images uploaded under the playlist CDN prefix', async () => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist(),
        items: [],
      });
      vi.mocked(PlaylistRepository.update).mockResolvedValue(makePlaylist());

      await PlaylistService.update(OWNER_ID, {
        playlistId: PLAYLIST_ID,
        coverImages: [`https://cdn.test/media/playlists/${PLAYLIST_ID}/cover-1.webp`],
      });

      expect(vi.mocked(PlaylistRepository.update)).toHaveBeenCalledWith(PLAYLIST_ID, {
        coverImages: [`https://cdn.test/media/playlists/${PLAYLIST_ID}/cover-1.webp`],
      });
    });

    it('accepts cover images matching current item artwork', async () => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist(),
        items: [makeItem()],
      });
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([makeTrackFile()]);
      vi.mocked(PlaylistRepository.update).mockResolvedValue(makePlaylist());

      await PlaylistService.update(OWNER_ID, {
        playlistId: PLAYLIST_ID,
        coverImages: ['https://cdn.test/covers/release-1.jpg'],
      });

      expect(vi.mocked(PlaylistRepository.update)).toHaveBeenCalledWith(PLAYLIST_ID, {
        coverImages: ['https://cdn.test/covers/release-1.jpg'],
      });
    });

    it('rejects a cover image from a foreign origin', async () => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist(),
        items: [],
      });

      await expect(
        PlaylistService.update(OWNER_ID, {
          playlistId: PLAYLIST_ID,
          coverImages: [`https://evil.test/media/playlists/${PLAYLIST_ID}/cover.webp`],
        })
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects a cover image that escapes the prefix with ..', async () => {
      vi.mocked(PlaylistRepository.findByIdWithItems).mockResolvedValue({
        ...makePlaylist(),
        items: [],
      });

      await expect(
        PlaylistService.update(OWNER_ID, {
          playlistId: PLAYLIST_ID,
          coverImages: [`https://cdn.test/media/playlists/${PLAYLIST_ID}/../other/steal.webp`],
        })
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('delete', () => {
    it('throws NOT_FOUND for an unowned playlist', async () => {
      vi.mocked(PlaylistRepository.findById).mockResolvedValue(
        makePlaylist({ ownerId: 'someone-else' })
      );

      await expect(PlaylistService.delete(OWNER_ID, PLAYLIST_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('deletes an owned playlist', async () => {
      vi.mocked(PlaylistRepository.findById).mockResolvedValue(makePlaylist());

      await PlaylistService.delete(OWNER_ID, PLAYLIST_ID);

      expect(vi.mocked(PlaylistRepository.delete)).toHaveBeenCalledWith(PLAYLIST_ID);
    });
  });

  describe('validateCoverImages', () => {
    const playlist = makePlaylist();
    const uploadedCover = `https://cdn.test/media/playlists/${PLAYLIST_ID}/cover-1.webp`;

    it('accepts an entry under the playlist CDN prefix', () => {
      expect(() =>
        PlaylistService.validateCoverImages(playlist, [uploadedCover], [])
      ).not.toThrow();
    });

    it('accepts an entry present in the resolved item artwork', () => {
      expect(() =>
        PlaylistService.validateCoverImages(
          playlist,
          ['https://cdn.test/covers/release-1.jpg'],
          ['https://cdn.test/covers/release-1.jpg']
        )
      ).not.toThrow();
    });

    it('rejects an entry from a foreign origin', () => {
      expect(() =>
        PlaylistService.validateCoverImages(
          playlist,
          [`https://evil.test/media/playlists/${PLAYLIST_ID}/cover.webp`],
          []
        )
      ).toThrow(expect.objectContaining({ name: 'DataError', code: 'INVALID_INPUT' }));
    });

    it('rejects a raw .. traversal below the prefix', () => {
      expect(() =>
        PlaylistService.validateCoverImages(
          playlist,
          [`https://cdn.test/media/playlists/${PLAYLIST_ID}/../escape.webp`],
          []
        )
      ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    });

    it('rejects an encoded %2e%2e traversal below the prefix', () => {
      expect(() =>
        PlaylistService.validateCoverImages(
          playlist,
          [`https://cdn.test/media/playlists/${PLAYLIST_ID}/%2e%2e/escape.webp`],
          []
        )
      ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    });

    it('rejects an unparseable entry', () => {
      expect(() => PlaylistService.validateCoverImages(playlist, ['not a url'], [])).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' })
      );
    });

    it('rejects an entry sharing only a prefix of another playlist id path', () => {
      expect(() =>
        PlaylistService.validateCoverImages(
          playlist,
          [`https://cdn.test/media/playlists/${PLAYLIST_ID}-evil/cover.webp`],
          []
        )
      ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    });

    it('still accepts item artwork when no CDN domain is configured', () => {
      vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', '');
      vi.stubEnv('CDN_DOMAIN', '');

      expect(() =>
        PlaylistService.validateCoverImages(playlist, ['art-1'], ['art-1'])
      ).not.toThrow();
    });

    it('rejects prefix entries when no CDN domain is configured', () => {
      vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', '');
      vi.stubEnv('CDN_DOMAIN', '');

      expect(() => PlaylistService.validateCoverImages(playlist, [uploadedCover], [])).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' })
      );
    });
  });

  describe('searchMedia', () => {
    it('requests each direct source capped at the group limit', async () => {
      await PlaylistService.searchMedia('night', OWNER_ID);

      expect(trackFileRepoMock.searchTracksByTitle).toHaveBeenCalledWith(
        'night',
        PLAYLIST_SEARCH_GROUP_LIMIT
      );
      expect(vi.mocked(VideoRepository.searchPublished)).toHaveBeenCalledWith(
        'night',
        PLAYLIST_SEARCH_GROUP_LIMIT
      );
      expect(vi.mocked(PlaylistRepository.searchPublicTrackItems)).toHaveBeenCalledWith(
        'night',
        OWNER_ID,
        PLAYLIST_SEARCH_GROUP_LIMIT
      );
    });

    it('searches releases with the documented take of 3', async () => {
      await PlaylistService.searchMedia('night', OWNER_ID);

      expect(vi.mocked(ReleaseService.getPublishedReleases)).toHaveBeenCalledWith({
        search: 'night',
        take: 3,
      });
    });

    it('omits empty groups entirely', async () => {
      trackFileRepoMock.searchTracksByTitle.mockResolvedValue([makeTrackFile()]);

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups.map(({ key }) => key)).toEqual(['songs']);
    });

    it('labels the groups and keeps them in priority order', async () => {
      trackFileRepoMock.searchTracksByTitle.mockResolvedValue([makeTrackFile()]);
      vi.mocked(VideoRepository.searchPublished).mockResolvedValue([makeVideo()]);
      vi.mocked(PlaylistRepository.searchPublicTrackItems).mockResolvedValue([
        { ...makeItem({ trackFileId: 'file-2' }), playlist: { id: 'pl-2', title: 'Public Mix' } },
      ]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ id: 'file-2' }),
      ]);
      vi.mocked(ReleaseService.getPublishedReleases).mockResolvedValue({
        success: true,
        data: [makeListing('release-9', 'Night Album')],
      });
      vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
        success: true,
        data: makeReleaseDetail('release-9', 'Night Album', [{ files: [{ id: 'file-9' }] }]),
      });
      vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
        success: true,
        data: [
          makeArtist('Night Artist', [
            { id: 'release-9', title: 'Night Album', publishedAt: NOW, deletedOn: null },
          ]),
        ],
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups.map(({ key, label }) => `${key}:${label}`)).toEqual([
        'songs:Songs',
        'videos:Videos',
        'publicPlaylists:From public playlists',
        'releases:From releases',
      ]);
    });

    it('maps a song row with live release fields and no context', async () => {
      trackFileRepoMock.searchTracksByTitle.mockResolvedValue([makeTrackFile()]);

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]?.items[0]).toEqual({
        key: 'track:file-1',
        itemType: 'track',
        title: 'Live Song',
        artistName: 'Killah Trakz',
        coverArt: 'https://cdn.test/covers/release-1.jpg',
        duration: 215,
        source: { trackFileId: 'file-1', releaseId: 'release-1' },
      });
    });

    it('falls back to the file name for an untitled song match', async () => {
      trackFileRepoMock.searchTracksByTitle.mockResolvedValue([makeTrackFile({ title: null })]);

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]?.items[0]?.title).toBe('01-live-song.mp3');
    });

    it('caps the songs group when the source over-returns', async () => {
      trackFileRepoMock.searchTracksByTitle.mockResolvedValue(
        Array.from({ length: PLAYLIST_SEARCH_GROUP_LIMIT + 1 }, (_, index) =>
          makeTrackFile({ id: `file-${index}` })
        )
      );

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]?.items).toHaveLength(PLAYLIST_SEARCH_GROUP_LIMIT);
    });

    it('maps a video row onto a video source', async () => {
      vi.mocked(VideoRepository.searchPublished).mockResolvedValue([makeVideo()]);

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]?.items[0]).toEqual({
        key: 'video:video-1',
        itemType: 'video',
        title: 'Live Video',
        artistName: 'Video Artist',
        coverArt: 'https://cdn.test/posters/video-1.jpg',
        duration: 240,
        source: { videoId: 'video-1' },
      });
    });

    it('re-resolves public playlist items with context and drops dangling rows', async () => {
      vi.mocked(PlaylistRepository.searchPublicTrackItems).mockResolvedValue([
        { ...makeItem({ trackFileId: 'file-2' }), playlist: { id: 'pl-2', title: 'Public Mix' } },
        {
          ...makeItem({ id: 'item-9', trackFileId: 'file-gone' }),
          playlist: { id: 'pl-3', title: 'Ghost Mix' },
        },
      ]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ id: 'file-2', title: 'Public Song' }),
      ]);

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]?.items).toEqual([
        expect.objectContaining({
          key: 'track:file-2',
          title: 'Public Song',
          context: 'Public Mix',
        }),
      ]);
    });

    it('skips public playlist rows without a track file id', async () => {
      vi.mocked(PlaylistRepository.searchPublicTrackItems).mockResolvedValue([
        { ...makeItem({ trackFileId: 'file-2' }), playlist: { id: 'pl-2', title: 'Public Mix' } },
        {
          ...makeItem({ id: 'item-8', trackFileId: null }),
          playlist: { id: 'pl-3', title: 'Ghost Mix' },
        },
      ]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ id: 'file-2' }),
      ]);

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]?.items.map(({ key }) => key)).toEqual(['track:file-2']);
    });

    it('drops a trackFileId already emitted by the songs group from later groups', async () => {
      trackFileRepoMock.searchTracksByTitle.mockResolvedValue([makeTrackFile({ id: 'file-1' })]);
      vi.mocked(PlaylistRepository.searchPublicTrackItems).mockResolvedValue([
        { ...makeItem({ trackFileId: 'file-1' }), playlist: { id: 'pl-2', title: 'Public Mix' } },
      ]);
      trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([
        makeTrackFile({ id: 'file-1' }),
      ]);

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups.map(({ key }) => key)).toEqual(['songs']);
    });

    it('keeps only unseen tracks in the releases group', async () => {
      trackFileRepoMock.searchTracksByTitle.mockResolvedValue([makeTrackFile({ id: 'file-1' })]);
      vi.mocked(ReleaseService.getPublishedReleases).mockResolvedValue({
        success: true,
        data: [makeListing('release-9', 'Night Album')],
      });
      vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
        success: true,
        data: makeReleaseDetail('release-9', 'Night Album', [
          { files: [{ id: 'file-1' }, { id: 'file-9', title: 'Deep Cut' }] },
        ]),
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[1]?.items).toEqual([
        {
          key: 'track:file-9',
          itemType: 'track',
          title: 'Deep Cut',
          artistName: 'Killah Trakz',
          coverArt: 'https://cdn.test/covers/release-9.jpg',
          duration: 180,
          source: { trackFileId: 'file-9', releaseId: 'release-9' },
          context: 'Night Album',
        },
      ]);
    });

    it('expands only MP3_320KBPS formats from release matches', async () => {
      vi.mocked(ReleaseService.getPublishedReleases).mockResolvedValue({
        success: true,
        data: [makeListing('release-9', 'Night Album')],
      });
      vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
        success: true,
        data: makeReleaseDetail('release-9', 'Night Album', [
          { formatType: 'WAV', files: [{ id: 'file-wav' }] },
          { formatType: 'MP3_320KBPS', files: [{ id: 'file-mp3' }] },
        ]),
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]?.items.map(({ key }) => key)).toEqual(['track:file-mp3']);
    });

    it('falls back to the file name for an untitled release track', async () => {
      vi.mocked(ReleaseService.getPublishedReleases).mockResolvedValue({
        success: true,
        data: [makeListing('release-9', 'Night Album')],
      });
      vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
        success: true,
        data: makeReleaseDetail('release-9', 'Night Album', [
          { files: [{ id: 'file-9', title: null }] },
        ]),
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]?.items[0]?.title).toBe('file-9.mp3');
    });

    it('omits the releases group when a matched release detail fails to load', async () => {
      vi.mocked(ReleaseService.getPublishedReleases).mockResolvedValue({
        success: true,
        data: [makeListing('release-9', 'Night Album')],
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups).toEqual([]);
    });

    it('caps an expanded group at the group limit', async () => {
      const files = Array.from({ length: PLAYLIST_SEARCH_GROUP_LIMIT + 4 }, (_, index) => ({
        id: `file-${index}`,
      }));
      vi.mocked(ReleaseService.getPublishedReleases).mockResolvedValue({
        success: true,
        data: [makeListing('release-9', 'Night Album')],
      });
      vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
        success: true,
        data: makeReleaseDetail('release-9', 'Night Album', [{ files }]),
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]?.items).toHaveLength(PLAYLIST_SEARCH_GROUP_LIMIT);
    });

    it('expands artist matches through their published releases with artist context', async () => {
      vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
        success: true,
        data: [
          makeArtist('Night Artist', [
            { id: 'release-old', title: 'Unpublished', publishedAt: null, deletedOn: null },
            { id: 'release-dead', title: 'Deleted', publishedAt: NOW, deletedOn: NOW },
            { id: 'release-9', title: 'Night Album', publishedAt: NOW, deletedOn: null },
          ]),
        ],
      });
      vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
        success: true,
        data: makeReleaseDetail('release-9', 'Night Album', [
          { files: [{ id: 'file-9', title: 'Deep Cut', duration: 200 }] },
        ]),
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups[0]).toEqual({
        key: 'artistMatch',
        label: 'By artist',
        items: [
          {
            key: 'track:file-9',
            itemType: 'track',
            title: 'Deep Cut',
            artistName: 'Night Artist',
            coverArt: 'https://cdn.test/covers/release-9.jpg',
            duration: 200,
            source: { trackFileId: 'file-9', releaseId: 'release-9' },
            context: 'Night Artist',
          },
        ],
      });
    });

    it('only fetches published, non-deleted releases for artist expansion', async () => {
      vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
        success: true,
        data: [
          makeArtist('Night Artist', [
            { id: 'release-old', title: 'Unpublished', publishedAt: null, deletedOn: null },
            { id: 'release-9', title: 'Night Album', publishedAt: NOW, deletedOn: null },
          ]),
        ],
      });
      vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
        success: true,
        data: makeReleaseDetail('release-9', 'Night Album', [{ files: [{ id: 'file-9' }] }]),
      });

      await PlaylistService.searchMedia('night', OWNER_ID);

      expect(vi.mocked(ReleaseService.getReleaseWithTracks)).toHaveBeenCalledTimes(1);
    });

    it('stops artist expansion at the release fetch bound', async () => {
      vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
        success: true,
        data: [
          makeArtist(
            'Night Artist',
            Array.from({ length: 4 }, (_, index) => ({
              id: `release-${index}`,
              title: `Album ${index}`,
              publishedAt: NOW,
              deletedOn: null,
            }))
          ),
        ],
      });

      await PlaylistService.searchMedia('night', OWNER_ID);

      expect(vi.mocked(ReleaseService.getReleaseWithTracks)).toHaveBeenCalledTimes(3);
    });

    it('omits the artist group when the artist search fails', async () => {
      vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
        success: false,
        error: 'boom',
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups).toEqual([]);
    });

    it('omits the artist group when its release expansions fail', async () => {
      vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
        success: true,
        data: [
          makeArtist('Night Artist', [
            { id: 'release-9', title: 'Night Album', publishedAt: NOW, deletedOn: null },
          ]),
        ],
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups).toEqual([]);
    });

    it('degrades to an omitted group when the release search fails', async () => {
      trackFileRepoMock.searchTracksByTitle.mockResolvedValue([makeTrackFile()]);
      vi.mocked(ReleaseService.getPublishedReleases).mockResolvedValue({
        success: false,
        error: 'boom',
      });

      const result = await PlaylistService.searchMedia('night', OWNER_ID);

      expect(result.groups.map(({ key }) => key)).toEqual(['songs']);
    });
  });

  describe('getMyPlaylists', () => {
    it('maps records to rows with an ISO updatedAt', async () => {
      vi.mocked(PlaylistRepository.findManyByOwner).mockResolvedValue([makePlaylist()]);

      const result = await PlaylistService.getMyPlaylists(OWNER_ID, { skip: 0, take: 10 });

      expect(result.rows[0]).toEqual({
        id: PLAYLIST_ID,
        title: 'Road Trip',
        isPublic: false,
        coverImages: [],
        itemCount: 2,
        totalDuration: 333,
        updatedAt: '2026-07-01T12:00:00.000Z',
      });
    });

    it('returns nextSkip = skip + take when a full page came back', async () => {
      vi.mocked(PlaylistRepository.findManyByOwner).mockResolvedValue([
        makePlaylist({ id: 'p-1' }),
        makePlaylist({ id: 'p-2' }),
      ]);

      const result = await PlaylistService.getMyPlaylists(OWNER_ID, { skip: 4, take: 2 });

      expect(result.nextSkip).toBe(6);
    });

    it('returns a null nextSkip for a short page', async () => {
      vi.mocked(PlaylistRepository.findManyByOwner).mockResolvedValue([makePlaylist()]);

      const result = await PlaylistService.getMyPlaylists(OWNER_ID, { skip: 0, take: 24 });

      expect(result.nextSkip).toBeNull();
    });

    it('passes the search term through to the repository', async () => {
      vi.mocked(PlaylistRepository.findManyByOwner).mockResolvedValue([]);

      await PlaylistService.getMyPlaylists(OWNER_ID, { skip: 0, take: 10, search: 'road' });

      expect(vi.mocked(PlaylistRepository.findManyByOwner)).toHaveBeenCalledWith(OWNER_ID, {
        skip: 0,
        take: 10,
        search: 'road',
      });
    });

    it('defaults to the playlists page size', async () => {
      vi.mocked(PlaylistRepository.findManyByOwner).mockResolvedValue([]);

      await PlaylistService.getMyPlaylists(OWNER_ID, {});

      expect(vi.mocked(PlaylistRepository.findManyByOwner)).toHaveBeenCalledWith(
        OWNER_ID,
        expect.objectContaining({ skip: 0, take: PLAYLISTS_PAGE_SIZE })
      );
    });
  });
});
