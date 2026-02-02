// Mock server-only first to prevent errors from imported modules
import { bulkCreateTracksAction, type BulkTrackData } from './bulk-create-tracks-action';
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
  },
}));
vi.mock('./find-or-create-release-action');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('next/cache');

const mockAuth = auth as unknown as ReturnType<typeof vi.fn<() => Promise<Session | null>>>;
const mockRequireRole = vi.mocked(requireRole);
const mockPrismaTrackCreate = vi.mocked(prisma.track.create);
const mockFindOrCreateRelease = vi.mocked(findOrCreateReleaseAction);

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
    });

    mockRequireRole.mockResolvedValue();
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
      });

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
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
        },
      ];

      const result = await bulkCreateTracksAction(tracks, true);

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

      await bulkCreateTracksAction(tracks, true);

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
      });

      const tracks: BulkTrackData[] = [
        {
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          album: 'Test Album',
        },
      ];

      const result = await bulkCreateTracksAction(tracks, false);

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

      await bulkCreateTracksAction(tracks, true);

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

      await bulkCreateTracksAction(tracks, true);

      // Should only call once due to case-insensitive caching
      expect(mockFindOrCreateRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrismaTrackCreate.mockRejectedValue(new Error('Connection failed'));

      const tracks: BulkTrackData[] = [
        { title: 'Test Track', duration: 180, audioUrl: 'https://example.com/track.mp3' },
      ];

      const result = await bulkCreateTracksAction(tracks);

      expect(result.success).toBe(false);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Connection failed');
    });
  });
});
