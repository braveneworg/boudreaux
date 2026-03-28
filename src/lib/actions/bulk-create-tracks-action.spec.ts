/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only first to prevent errors from imported modules
import { bulkCreateTracksAction, type BulkTrackData } from './bulk-create-tracks-action';
import { findOrCreateArtistAction } from './find-or-create-artist-action';
import { findOrCreateReleaseAction } from './find-or-create-release-action';
import { prisma } from '../prisma';
import { requireRole } from '../utils/auth/require-role';

vi.mock('server-only', () => ({}));

// Mock all dependencies
vi.mock('../prisma', () => ({
  prisma: {
    track: {
      create: vi.fn(),
    },
    releaseTrack: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    trackArtist: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    artistRelease: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('./find-or-create-release-action');
vi.mock('./find-or-create-artist-action');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('next/cache');

const mockRequireRole = vi.mocked(requireRole);
const mockPrismaTrackCreate = vi.mocked(prisma.track.create);
const mockPrismaTransaction = vi.mocked(prisma.$transaction);
const mockPrismaArtistReleaseFindUnique = vi.mocked(prisma.artistRelease.findUnique);
const mockPrismaArtistReleaseCreate = vi.mocked(prisma.artistRelease.create);
const mockPrismaReleaseTrackFindUnique = vi.mocked(prisma.releaseTrack.findUnique);
const mockPrismaReleaseTrackCreate = vi.mocked(prisma.releaseTrack.create);
const mockPrismaTrackArtistFindUnique = vi.mocked(prisma.trackArtist.findUnique);
const mockPrismaTrackArtistCreate = vi.mocked(prisma.trackArtist.create);
const mockFindOrCreateRelease = vi.mocked(findOrCreateReleaseAction);
const mockFindOrCreateArtist = vi.mocked(findOrCreateArtistAction);

describe('bulkCreateTracksAction', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      name: 'Test Admin',
      email: 'admin@test.com',
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default auth setup - admin user
    mockRequireRole.mockResolvedValue(mockSession as never);

    // Default transaction mock
    mockPrismaTransaction.mockImplementation(async (callback) => {
      const mockTx = {
        track: {
          create: mockPrismaTrackCreate,
        },
        releaseTrack: {
          findUnique: mockPrismaReleaseTrackFindUnique,
          create: mockPrismaReleaseTrackCreate,
        },
        trackArtist: {
          findUnique: mockPrismaTrackArtistFindUnique,
          create: mockPrismaTrackArtistCreate,
        },
        artistRelease: {
          findUnique: mockPrismaArtistReleaseFindUnique,
          create: mockPrismaArtistReleaseCreate,
        },
      };
      return callback(mockTx as never);
    });
  });

  describe('validation', () => {
    it('should reject empty tracks array', async () => {
      const result = await bulkCreateTracksAction([]);

      expect(result).toEqual({
        success: false,
        successCount: 0,
        failedCount: 0,
        results: [],
        error: 'No tracks provided',
      });
    });

    it('should reject more than 100 tracks', async () => {
      const tracks: BulkTrackData[] = Array.from({ length: 101 }, (_, i) => ({
        title: `Track ${i + 1}`,
        duration: 180,
        audioUrl: `https://example.com/track${i + 1}.mp3`,
      }));

      const result = await bulkCreateTracksAction(tracks);

      expect(result).toEqual({
        success: false,
        successCount: 0,
        failedCount: 101,
        results: [],
        error: 'Maximum 100 tracks can be uploaded at once',
      });
    });

    it('should require admin role', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      await expect(bulkCreateTracksAction(tracks)).rejects.toThrow('Unauthorized');
    });
  });

  describe('track validation', () => {
    it('should validate required title', async () => {
      const tracks: BulkTrackData[] = [
        { title: '', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.results[0]).toEqual({
        index: 0,
        success: false,
        title: 'Track 1', // Fallback title when empty
        error: 'Title is required',
      });
    });

    it('should validate required audioUrl', async () => {
      const tracks: BulkTrackData[] = [{ title: 'Test Track', duration: 180, audioUrl: '' }];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.results[0]).toEqual({
        index: 0,
        success: false,
        title: 'Test Track',
        error: 'Audio URL is required',
      });
    });

    it('should validate duration', async () => {
      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 0, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.results[0]).toEqual({
        index: 0,
        success: false,
        title: 'Test Track',
        error: 'Valid duration is required',
      });
    });
  });

  describe('track creation', () => {
    it('should create a single track successfully', async () => {
      mockPrismaTrackCreate.mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
        audioFileHash: null,
      });

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.results[0]).toEqual({
        index: 0,
        success: true,
        trackId: 'track-123',
        title: 'Test Track',
        releaseId: undefined,
        releaseTitle: undefined,
        releaseCreated: undefined,
      });
    });

    it('should create multiple tracks successfully', async () => {
      mockPrismaTrackCreate
        .mockResolvedValueOnce({
          id: 'track-1',
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          position: 1,
          coverArt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedOn: null,
          publishedOn: null,
          audioUploadStatus: 'COMPLETED',
          audioFileHash: null,
        })
        .mockResolvedValueOnce({
          id: 'track-2',
          title: 'Track 2',
          duration: 200,
          audioUrl: 'https://example.com/track2.mp3',
          position: 2,
          coverArt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedOn: null,
          publishedOn: null,
          audioUploadStatus: 'COMPLETED',
          audioFileHash: null,
        });

      const tracks: BulkTrackData[] = [
        {
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          position: 1,
        },
        {
          title: 'Track 2',
          duration: 200,
          audioUrl: 'https://example.com/track2.mp3',
          position: 2,
        },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should handle partial failures', async () => {
      mockPrismaTrackCreate
        .mockResolvedValueOnce({
          id: 'track-1',
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          position: 1,
          coverArt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedOn: null,
          publishedOn: null,
          audioUploadStatus: 'COMPLETED',
          audioFileHash: null,
        })
        .mockRejectedValueOnce(new Error('Database error'));

      const tracks: BulkTrackData[] = [
        { title: 'Track 1', duration: 180, audioUrl: 'https://example.com/track1.mp3' },
        { title: 'Track 2', duration: 200, audioUrl: 'https://example.com/track2.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.success).toBe(false);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Failed to create track');
    });

    it('should detect duplicate title errors', async () => {
      mockPrismaTrackCreate.mockRejectedValue(new Error('Unique constraint violation'));

      const tracks: BulkTrackData[] = [
        { title: 'Existing Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.results[0].error).toBe('A track with this title already exists');
    });

    it('should detect duplicate track error with "duplicate" keyword', async () => {
      mockPrismaTrackCreate.mockRejectedValue(new Error('Duplicate entry detected'));

      const tracks: BulkTrackData[] = [
        { title: 'Duplicate Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('A track with this title already exists');
    });
  });

  describe('release association', () => {
    it('should create release when autoCreateRelease is true and album is present', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: true,
      });

      mockPrismaTrackCreate.mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
        audioFileHash: null,
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
        },
      ];

      const result = await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      expect(mockFindOrCreateRelease).toHaveBeenCalledWith(
        {
          album: 'Test Album',
          year: undefined,
          date: undefined,
          label: undefined,
          catalogNumber: undefined,
          albumArtist: undefined,
          lossless: undefined,
          coverArt: undefined,
        },
        { publish: false }
      );

      expect(result.results[0].releaseId).toBe('release-123');
      expect(result.results[0].releaseTitle).toBe('Test Album');
      expect(result.results[0].releaseCreated).toBe(true);
    });

    it('should pass coverArt to ReleaseTrack when creating track with release', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: true,
      });

      mockPrismaTrackCreate.mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: 'data:image/jpeg;base64,/9j/4AAQ...',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
        audioFileHash: null,
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
          coverArt: 'data:image/jpeg;base64,/9j/4AAQ...',
          position: 1,
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      expect(mockPrismaTrackCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          position: 1,
          coverArt: 'data:image/jpeg;base64,/9j/4AAQ...',
          releaseTracks: {
            create: {
              releaseId: 'release-123',
              position: 1,
              coverArt: 'data:image/jpeg;base64,/9j/4AAQ...',
            },
          },
        }),
      });
    });

    it('should skip release creation when autoCreateRelease is false', async () => {
      mockPrismaTrackCreate.mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
        audioFileHash: null,
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
        },
      ];

      const result = await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      expect(mockFindOrCreateRelease).not.toHaveBeenCalled();
      expect(result.results[0].releaseId).toBeUndefined();
    });

    it('should cache release lookups for same album', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Same Album',
        created: true,
      });

      mockPrismaTrackCreate.mockResolvedValue({
        id: 'track-123',
        title: 'Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
        audioFileHash: null,
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          album: 'Same Album',
        },
        {
          title: 'Track 2',
          duration: 180,
          audioUrl: 'https://example.com/track2.mp3',
          album: 'Same Album',
        },
        {
          title: 'Track 3',
          duration: 180,
          audioUrl: 'https://example.com/track3.mp3',
          album: 'Same Album',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      // Should only call findOrCreateRelease once due to caching
      expect(mockFindOrCreateRelease).toHaveBeenCalledTimes(1);
    });

    it('should handle case-insensitive album caching', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Same Album',
        created: false,
      });

      mockPrismaTrackCreate.mockResolvedValue({
        id: 'track-123',
        title: 'Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
        audioFileHash: null,
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          album: 'Same Album',
        },
        {
          title: 'Track 2',
          duration: 180,
          audioUrl: 'https://example.com/track2.mp3',
          album: 'SAME ALBUM',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      // Should only call once due to case-insensitive caching
      expect(mockFindOrCreateRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return callback({
          track: {
            create: vi.fn().mockRejectedValue(new Error('Connection failed')),
          },
          artistRelease: {
            findUnique: vi.fn(),
            create: vi.fn(),
          },
        } as never);
      });

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.success).toBe(false);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Failed to create track');
    });
  });

  describe('publishTracks parameter', () => {
    beforeEach(() => {
      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: {
            create: vi.fn().mockResolvedValue({
              id: 'track-123',
              title: 'Test Track',
              duration: 180,
              audioUrl: 'https://example.com/track.mp3',
              position: 1,
              coverArt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedOn: null,
              publishedOn: null,
              audioUploadStatus: 'COMPLETED',
            }),
          },
          artistRelease: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
          },
        };
        return callback(mockTx as never);
      });
    });

    it('should not set publishedOn when publishTracks is false', async () => {
      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn(), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false, publishTracks: false });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedOn: undefined,
          }),
        })
      );
    });

    it('should set publishedOn to current date when publishTracks is true', async () => {
      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: new Date(),
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn(), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false, publishTracks: true });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedOn: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('publish option propagation to findOrCreateReleaseAction', () => {
    beforeEach(() => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: true,
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: {
            create: vi.fn().mockResolvedValue({
              id: 'track-123',
              title: 'Test Track',
              duration: 180,
              audioUrl: 'https://example.com/track.mp3',
              position: 1,
              coverArt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedOn: null,
              publishedOn: null,
              audioUploadStatus: 'COMPLETED',
              audioFileHash: null,
            }),
          },
          artistRelease: { findUnique: vi.fn(), create: vi.fn() },
        };
        return callback(mockTx as never);
      });
    });

    it('should pass publish: true to findOrCreateReleaseAction when publishTracks is true', async () => {
      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
        },
      ];

      await bulkCreateTracksAction(tracks, {
        autoCreateRelease: true,
        publishTracks: true,
      });

      expect(mockFindOrCreateRelease).toHaveBeenCalledWith(
        expect.objectContaining({ album: 'Test Album' }),
        { publish: true }
      );
    });

    it('should pass publish: false to findOrCreateReleaseAction when publishTracks is false', async () => {
      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
        },
      ];

      await bulkCreateTracksAction(tracks, {
        autoCreateRelease: true,
        publishTracks: false,
      });

      expect(mockFindOrCreateRelease).toHaveBeenCalledWith(
        expect.objectContaining({ album: 'Test Album' }),
        { publish: false }
      );
    });

    it('should default publish to false when publishTracks is not specified', async () => {
      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      expect(mockFindOrCreateRelease).toHaveBeenCalledWith(
        expect.objectContaining({ album: 'Test Album' }),
        { publish: false }
      );
    });
  });

  describe('artist creation and association', () => {
    beforeEach(() => {
      mockFindOrCreateArtist.mockResolvedValue({
        success: true,
        artistId: 'artist-123',
        artistName: 'Test Artist',
        created: true,
        artistReleaseCreated: false,
        trackArtistCreated: false,
      });
    });

    it('should call findOrCreateArtistAction when artist metadata is present', async () => {
      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          artist: 'Test Artist',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      expect(mockFindOrCreateArtist).toHaveBeenCalledWith(
        'Test Artist',
        expect.objectContaining({
          releaseId: undefined,
          tx: expect.anything(),
        })
      );
    });

    it('should cache artist lookups for same artist name', async () => {
      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          artist: 'Same Artist',
        },
        {
          title: 'Track 2',
          duration: 180,
          audioUrl: 'https://example.com/track2.mp3',
          artist: 'Same Artist',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      // Should only call findOrCreateArtistAction once due to caching
      expect(mockFindOrCreateArtist).toHaveBeenCalledTimes(1);
    });

    it('should skip ArtistRelease creation when it already exists for cached artist', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: false,
      });

      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
        audioFileHash: null,
      });

      // Return an existing ArtistRelease record so creation is skipped
      const artistReleaseFindUnique = vi.fn().mockResolvedValue({
        id: 'ar-1',
        artistId: 'artist-123',
        releaseId: 'release-123',
      });
      const artistReleaseCreate = vi.fn();

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: artistReleaseFindUnique, create: artistReleaseCreate },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          artist: 'Test Artist',
          album: 'Test Album',
        },
        {
          title: 'Track 2',
          duration: 180,
          audioUrl: 'https://example.com/track2.mp3',
          artist: 'Test Artist',
          album: 'Test Album',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      // Second track uses cached artist and finds existing ArtistRelease,
      // so artistRelease.create should NOT be called in the cached path
      expect(artistReleaseFindUnique).toHaveBeenCalled();
      expect(artistReleaseCreate).not.toHaveBeenCalled();
    });

    it('should create ArtistRelease for cached artist when association does not exist', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: false,
      });

      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
        audioFileHash: null,
      });

      // Return null so the ArtistRelease does NOT exist yet
      const artistReleaseFindUnique = vi.fn().mockResolvedValue(null);
      const artistReleaseCreate = vi.fn();

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: artistReleaseFindUnique, create: artistReleaseCreate },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          artist: 'Test Artist',
          album: 'Test Album',
        },
        {
          title: 'Track 2',
          duration: 180,
          audioUrl: 'https://example.com/track2.mp3',
          artist: 'Test Artist',
          album: 'Test Album',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      // First track creates the artist via findOrCreateArtistAction (not cached yet)
      // Second track uses cached artist and finds no existing ArtistRelease,
      // so artistRelease.create SHOULD be called in the cached path
      expect(mockFindOrCreateArtist).toHaveBeenCalledTimes(1);
      expect(artistReleaseFindUnique).toHaveBeenCalled();
      expect(artistReleaseCreate).toHaveBeenCalledWith({
        data: {
          artistId: 'artist-123',
          releaseId: 'release-123',
        },
      });
    });

    it('should connect track to artist when artist is found/created', async () => {
      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          artist: 'Test Artist',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            artists: {
              create: {
                artistId: 'artist-123',
              },
            },
          }),
        })
      );
    });
  });

  describe('transaction support', () => {
    it('should wrap track creation in a transaction', async () => {
      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn(), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      expect(mockPrismaTransaction).toHaveBeenCalled();
    });

    it('should pass transaction client to findOrCreateArtistAction', async () => {
      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          artist: 'Test Artist',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      expect(mockFindOrCreateArtist).toHaveBeenCalledWith(
        'Test Artist',
        expect.objectContaining({
          tx: expect.anything(),
        })
      );
    });
  });

  describe('deferUpload parameter', () => {
    it('should use pending URL when deferUpload is true and audioUrl is empty', async () => {
      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'pending://upload',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'PENDING',
        audioFileHash: null,
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn(), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [{ title: 'Test Track', duration: 180, audioUrl: '' }];

      await bulkCreateTracksAction(tracks, { deferUpload: true });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            audioUrl: 'pending://upload',
            audioUploadStatus: 'PENDING',
          }),
        })
      );
    });

    it('should use provided audioUrl when deferUpload is true and audioUrl is present', async () => {
      const createMock = vi.fn().mockResolvedValue({
        id: 'track-123',
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/track.mp3',
        position: 1,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'PENDING',
        audioFileHash: null,
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn(), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      await bulkCreateTracksAction(tracks, { deferUpload: true });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            audioUrl: 'https://example.com/track.mp3',
            audioUploadStatus: 'PENDING',
          }),
        })
      );
    });
  });

  describe('global error handling', () => {
    it('should handle errors thrown outside transaction loop', async () => {
      // Cause an error in the initial release finding phase
      mockFindOrCreateRelease.mockRejectedValue(new Error('Unexpected error'));

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
        },
      ];

      const result = await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      expect(result).toEqual({
        success: false,
        successCount: 0,
        failedCount: 1,
        results: [],
        error: 'An unexpected error occurred',
      });
    });

    it('should handle non-Error objects thrown', async () => {
      // Cause an error with non-Error type
      mockFindOrCreateRelease.mockRejectedValue('string error');

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
        },
      ];

      const result = await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      expect(result).toEqual({
        success: false,
        successCount: 0,
        failedCount: 1,
        results: [],
        error: 'An unexpected error occurred',
      });
    });
  });

  describe('existingTrackId support (association-only mode)', () => {
    it('should create release and associations for existing track without creating a new Track', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: true,
      });

      mockFindOrCreateArtist.mockResolvedValue({
        success: true,
        artistId: 'artist-123',
        artistName: 'Test Artist',
        created: false,
        artistReleaseCreated: false,
        trackArtistCreated: false,
      });

      const releaseTrackFindUnique = vi.fn().mockResolvedValue(null);
      const releaseTrackCreate = vi.fn();
      const trackArtistFindUnique = vi.fn().mockResolvedValue(null);
      const trackArtistCreate = vi.fn();

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: mockPrismaTrackCreate },
          releaseTrack: { findUnique: releaseTrackFindUnique, create: releaseTrackCreate },
          trackArtist: { findUnique: trackArtistFindUnique, create: trackArtistCreate },
          artistRelease: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
          },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          existingTrackId: 'existing-track-123',
          title: 'Existing Track',
          duration: 180,
          album: 'Test Album',
          artist: 'Test Artist',
          position: 3,
        },
      ];

      const result = await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.results[0].trackId).toBe('existing-track-123');
      expect(result.results[0].releaseId).toBe('release-123');

      // Should NOT create a new track record
      expect(mockPrismaTrackCreate).not.toHaveBeenCalled();

      // Should create ReleaseTrack association
      expect(releaseTrackFindUnique).toHaveBeenCalledWith({
        where: { releaseId_trackId: { releaseId: 'release-123', trackId: 'existing-track-123' } },
      });
      expect(releaseTrackCreate).toHaveBeenCalledWith({
        data: { releaseId: 'release-123', trackId: 'existing-track-123', position: 3 },
      });

      // Should create TrackArtist association
      expect(trackArtistFindUnique).toHaveBeenCalledWith({
        where: { trackId_artistId: { trackId: 'existing-track-123', artistId: 'artist-123' } },
      });
      expect(trackArtistCreate).toHaveBeenCalledWith({
        data: { trackId: 'existing-track-123', artistId: 'artist-123' },
      });
    });

    it('should skip ReleaseTrack creation when association already exists', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: false,
      });

      const releaseTrackFindUnique = vi.fn().mockResolvedValue({
        id: 'rt-1',
        releaseId: 'release-123',
        trackId: 'existing-track-123',
      });
      const releaseTrackCreate = vi.fn();

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: mockPrismaTrackCreate },
          releaseTrack: { findUnique: releaseTrackFindUnique, create: releaseTrackCreate },
          trackArtist: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          existingTrackId: 'existing-track-123',
          title: 'Existing Track',
          duration: 180,
          album: 'Test Album',
        },
      ];

      const result = await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      expect(result.success).toBe(true);
      expect(releaseTrackFindUnique).toHaveBeenCalled();
      expect(releaseTrackCreate).not.toHaveBeenCalled();
    });

    it('should skip TrackArtist creation when association already exists', async () => {
      mockFindOrCreateArtist.mockResolvedValue({
        success: true,
        artistId: 'artist-123',
        artistName: 'Test Artist',
        created: false,
        artistReleaseCreated: false,
        trackArtistCreated: false,
      });

      const trackArtistFindUnique = vi.fn().mockResolvedValue({
        id: 'ta-1',
        trackId: 'existing-track-123',
        artistId: 'artist-123',
      });
      const trackArtistCreate = vi.fn();

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: mockPrismaTrackCreate },
          releaseTrack: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
          trackArtist: { findUnique: trackArtistFindUnique, create: trackArtistCreate },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          existingTrackId: 'existing-track-123',
          title: 'Existing Track',
          duration: 180,
          artist: 'Test Artist',
        },
      ];

      const result = await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      expect(result.success).toBe(true);
      expect(trackArtistFindUnique).toHaveBeenCalled();
      expect(trackArtistCreate).not.toHaveBeenCalled();
    });

    it('should skip validation for existing tracks', async () => {
      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: mockPrismaTrackCreate },
          releaseTrack: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
          trackArtist: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      // Existing track with no audioUrl and zero duration — validation should be skipped
      const tracks: BulkTrackData[] = [
        {
          existingTrackId: 'existing-track-123',
          title: 'Existing Track',
          duration: 0,
          audioUrl: '',
        },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.success).toBe(true);
      expect(result.results[0].trackId).toBe('existing-track-123');
      expect(mockPrismaTrackCreate).not.toHaveBeenCalled();
    });

    it('should handle mix of new and existing tracks', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: false,
      });

      const releaseTrackFindUnique = vi.fn().mockResolvedValue(null);
      const releaseTrackCreate = vi.fn();

      mockPrismaTrackCreate.mockResolvedValue({
        id: 'new-track-456',
        title: 'New Track',
        duration: 200,
        audioUrl: 'https://example.com/new.mp3',
        position: 2,
        coverArt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedOn: null,
        publishedOn: null,
        audioUploadStatus: 'COMPLETED',
        audioFileHash: null,
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: mockPrismaTrackCreate },
          releaseTrack: { findUnique: releaseTrackFindUnique, create: releaseTrackCreate },
          trackArtist: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          existingTrackId: 'existing-track-123',
          title: 'Existing Track',
          duration: 180,
          album: 'Test Album',
          position: 1,
        },
        {
          title: 'New Track',
          duration: 200,
          audioUrl: 'https://example.com/new.mp3',
          album: 'Test Album',
          position: 2,
        },
      ];

      const result = await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);

      // First result is the existing track
      expect(result.results[0].trackId).toBe('existing-track-123');
      expect(result.results[0].releaseId).toBe('release-123');

      // Second result is the new track
      expect(result.results[1].trackId).toBe('new-track-456');
      expect(result.results[1].releaseId).toBe('release-123');

      // Track.create should only be called once (for the new track)
      expect(mockPrismaTrackCreate).toHaveBeenCalledTimes(1);

      // ReleaseTrack.findUnique should be called for the existing track
      expect(releaseTrackFindUnique).toHaveBeenCalledWith({
        where: { releaseId_trackId: { releaseId: 'release-123', trackId: 'existing-track-123' } },
      });
    });
  });
});
