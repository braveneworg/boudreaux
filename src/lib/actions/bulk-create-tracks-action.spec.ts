// Mock server-only first to prevent errors from imported modules
import { bulkCreateTracksAction, type BulkTrackData } from './bulk-create-tracks-action';
import { findOrCreateArtistAction } from './find-or-create-artist-action';
import { findOrCreateGroupAction } from './find-or-create-group-action';
import { findOrCreateReleaseAction } from './find-or-create-release-action';
import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { requireRole } from '../utils/auth/require-role';

import type { Session } from 'next-auth';

vi.mock('server-only', () => ({}));

// Mock all dependencies
vi.mock('../../../auth');
vi.mock('../prisma', () => ({
  prisma: {
    track: {
      create: vi.fn(),
    },
    artistRelease: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    artistGroup: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('./find-or-create-release-action');
vi.mock('./find-or-create-artist-action');
vi.mock('./find-or-create-group-action');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('next/cache');

const mockAuth = auth as unknown as ReturnType<typeof vi.fn<() => Promise<Session | null>>>;
const mockRequireRole = vi.mocked(requireRole);
const mockPrismaTrackCreate = vi.mocked(prisma.track.create);
const mockPrismaTransaction = vi.mocked(prisma.$transaction);
const mockPrismaArtistReleaseFindUnique = vi.mocked(prisma.artistRelease.findUnique);
const mockPrismaArtistReleaseCreate = vi.mocked(prisma.artistRelease.create);
const mockFindOrCreateRelease = vi.mocked(findOrCreateReleaseAction);
const mockFindOrCreateArtist = vi.mocked(findOrCreateArtistAction);
const mockFindOrCreateGroup = vi.mocked(findOrCreateGroupAction);

describe('bulkCreateTracksAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default auth setup - admin user
    mockAuth.mockResolvedValue({
      user: {
        id: 'user-123',
        role: 'admin',
        name: 'Test Admin',
        email: 'admin@test.com',
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as Session);

    mockRequireRole.mockResolvedValue();

    // Default transaction mock
    mockPrismaTransaction.mockImplementation(async (callback) => {
      const mockTx = {
        track: {
          create: mockPrismaTrackCreate,
        },
        artistRelease: {
          findUnique: mockPrismaArtistReleaseFindUnique,
          create: mockPrismaArtistReleaseCreate,
        },
        artistGroup: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
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

  describe('authentication', () => {
    it('should reject if session is missing', async () => {
      mockAuth.mockResolvedValue(null);

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result).toEqual({
        success: false,
        successCount: 0,
        failedCount: 1,
        results: [],
        error: 'You must be a logged in admin user to create tracks',
      });
    });

    it('should reject if user is not admin', async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'user-123',
          role: 'user',
          name: 'Test User',
          email: 'user@test.com',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as Session);

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result).toEqual({
        success: false,
        successCount: 0,
        failedCount: 1,
        results: [],
        error: 'You must be a logged in admin user to create tracks',
      });
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
      expect(result.results[1].error).toBe('Database error');
    });

    it('should detect duplicate title errors', async () => {
      mockPrismaTrackCreate.mockRejectedValue(new Error('Unique constraint violation'));

      const tracks: BulkTrackData[] = [
        { title: 'Existing Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

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

      expect(mockFindOrCreateRelease).toHaveBeenCalledWith({
        album: 'Test Album',
        year: undefined,
        date: undefined,
        label: undefined,
        catalogNumber: undefined,
        albumArtist: undefined,
        lossless: undefined,
        coverArt: undefined,
      });

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
          artistGroup: {
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
      expect(result.results[0].error).toBe('Connection failed');
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
          artistGroup: {
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
          artistGroup: { findUnique: vi.fn(), create: vi.fn() },
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
          artistGroup: { findUnique: vi.fn(), create: vi.fn() },
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
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
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

    it('should use albumArtist as group when artist is not provided', async () => {
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
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      mockFindOrCreateGroup.mockResolvedValue({
        success: true,
        groupId: 'group-123',
        groupName: 'Album Artist',
        created: true,
        artistGroupCreated: false,
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          albumArtist: 'Album Artist',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      // albumArtist without a distinct artist creates a Group, not an Artist
      expect(mockFindOrCreateGroup).toHaveBeenCalledWith(
        'Album Artist',
        expect.objectContaining({
          tx: expect.anything(),
        })
      );
      expect(mockFindOrCreateArtist).not.toHaveBeenCalled();
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
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
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
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
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

  describe('group creation from albumArtist metadata', () => {
    beforeEach(() => {
      mockFindOrCreateArtist.mockResolvedValue({
        success: true,
        artistId: 'artist-123',
        artistName: 'John Lennon',
        created: true,
        artistReleaseCreated: false,
        trackArtistCreated: false,
      });

      mockFindOrCreateGroup.mockResolvedValue({
        success: true,
        groupId: 'group-123',
        groupName: 'The Beatles',
        created: true,
        artistGroupCreated: true,
      });
    });

    it('should create group when albumArtist differs from artist', async () => {
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
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Imagine',
          duration: 180,
          audioUrl: 'https://example.com/imagine.mp3',
          artist: 'John Lennon',
          albumArtist: 'The Beatles',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      expect(mockFindOrCreateGroup).toHaveBeenCalledWith(
        'The Beatles',
        expect.objectContaining({
          artistId: 'artist-123',
          tx: expect.anything(),
        })
      );
    });

    it('should create group when albumArtist matches artist', async () => {
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
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      mockFindOrCreateGroup.mockResolvedValue({
        success: true,
        groupId: 'group-123',
        groupName: 'The Beatles',
        created: true,
        artistGroupCreated: false,
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          artist: 'The Beatles',
          albumArtist: 'The Beatles',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      // When albumArtist matches artist, treat albumArtist as Group and skip individual Artist
      expect(mockFindOrCreateGroup).toHaveBeenCalledWith(
        'The Beatles',
        expect.objectContaining({
          tx: expect.anything(),
        })
      );
      expect(mockFindOrCreateArtist).not.toHaveBeenCalled();
    });

    it('should create group when albumArtist matches artist (case-insensitive)', async () => {
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
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      mockFindOrCreateGroup.mockResolvedValue({
        success: true,
        groupId: 'group-123',
        groupName: 'THE BEATLES',
        created: true,
        artistGroupCreated: false,
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          artist: 'the beatles',
          albumArtist: 'THE BEATLES',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      // Case-insensitive match: albumArtist treated as Group, no individual Artist created
      expect(mockFindOrCreateGroup).toHaveBeenCalledWith(
        'THE BEATLES',
        expect.objectContaining({
          tx: expect.anything(),
        })
      );
      expect(mockFindOrCreateArtist).not.toHaveBeenCalled();
    });

    it('should cache group lookups for same group name', async () => {
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
      });

      const artistGroupFindUnique = vi.fn().mockResolvedValue(null);
      const artistGroupCreate = vi.fn();

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
          artistGroup: { findUnique: artistGroupFindUnique, create: artistGroupCreate },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          artist: 'John Lennon',
          albumArtist: 'The Beatles',
        },
        {
          title: 'Track 2',
          duration: 180,
          audioUrl: 'https://example.com/track2.mp3',
          artist: 'Paul McCartney',
          albumArtist: 'The Beatles',
        },
      ];

      // Reset the mock to return different artist IDs
      mockFindOrCreateArtist
        .mockResolvedValueOnce({
          success: true,
          artistId: 'artist-john',
          artistName: 'John Lennon',
          created: true,
          artistReleaseCreated: false,
          trackArtistCreated: false,
        })
        .mockResolvedValueOnce({
          success: true,
          artistId: 'artist-paul',
          artistName: 'Paul McCartney',
          created: true,
          artistReleaseCreated: false,
          trackArtistCreated: false,
        });

      await bulkCreateTracksAction(tracks, { autoCreateRelease: false });

      // Should only call findOrCreateGroupAction once due to caching
      expect(mockFindOrCreateGroup).toHaveBeenCalledTimes(1);
    });
  });

  describe('albumArtist and release association', () => {
    it('should link albumArtist as group to release when both are present', async () => {
      mockFindOrCreateRelease.mockResolvedValue({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: true,
      });

      mockFindOrCreateGroup.mockResolvedValue({
        success: true,
        groupId: 'group-123',
        groupName: 'Album Artist',
        created: true,
        artistGroupCreated: false,
      });

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
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
          albumArtist: 'Album Artist',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      // albumArtist creates a Group in the first pass (outside transaction)
      // when autoCreateRelease is true and album is present
      expect(mockFindOrCreateGroup).toHaveBeenCalledWith('Album Artist');
      expect(mockFindOrCreateArtist).not.toHaveBeenCalled();
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
          artistGroup: { findUnique: vi.fn(), create: vi.fn() },
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
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
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

  describe('albumArtist caching across multiple tracks', () => {
    it('should cache group for albumArtist across tracks with different albums', async () => {
      // First release setup
      mockFindOrCreateRelease
        .mockResolvedValueOnce({
          success: true,
          releaseId: 'release-1',
          releaseTitle: 'Album 1',
          created: true,
        })
        .mockResolvedValueOnce({
          success: true,
          releaseId: 'release-2',
          releaseTitle: 'Album 2',
          created: true,
        });

      mockFindOrCreateGroup.mockResolvedValue({
        success: true,
        groupId: 'group-123',
        groupName: 'Same Artist',
        created: true,
        artistGroupCreated: false,
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
      });

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const mockTx = {
          track: { create: createMock },
          artistRelease: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
          artistGroup: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
        };
        return callback(mockTx as never);
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Track 1',
          duration: 180,
          audioUrl: 'https://example.com/track1.mp3',
          album: 'Album 1',
          albumArtist: 'Same Artist',
        },
        {
          title: 'Track 2',
          duration: 180,
          audioUrl: 'https://example.com/track2.mp3',
          album: 'Album 2',
          albumArtist: 'Same Artist',
        },
      ];

      await bulkCreateTracksAction(tracks, { autoCreateRelease: true });

      // findOrCreateGroupAction should be called once in the first pass
      // (outside transaction); the second track uses the cached group
      expect(mockFindOrCreateGroup).toHaveBeenCalledTimes(1);
      expect(mockFindOrCreateGroup).toHaveBeenCalledWith('Same Artist');
      expect(mockFindOrCreateArtist).not.toHaveBeenCalled();
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
        error: 'Unexpected error',
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
});
