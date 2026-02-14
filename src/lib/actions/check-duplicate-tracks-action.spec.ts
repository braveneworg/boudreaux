import { requireRole } from '@/lib/utils/auth/require-role';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';

import { prisma } from '../prisma';
import { checkDuplicateTracksAction } from './check-duplicate-tracks-action';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/utils/auth/require-role', () => ({
  requireRole: vi.fn(),
}));
vi.mock('../prisma', () => ({
  prisma: {
    track: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/utils/s3-key-utils', () => ({
  extractS3KeyFromUrl: vi.fn(),
}));

const mockRequireRole = vi.mocked(requireRole);
const mockFindMany = vi.mocked(prisma.track.findMany);
const mockExtractS3Key = vi.mocked(extractS3KeyFromUrl);

describe('checkDuplicateTracksAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined as never);
  });

  it('should require admin role', async () => {
    await checkDuplicateTracksAction([]);
    expect(mockRequireRole).toHaveBeenCalledWith('admin');
  });

  it('should return empty duplicates for empty hashes array', async () => {
    const result = await checkDuplicateTracksAction([]);
    expect(result).toEqual({ success: true, duplicates: [] });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('should return empty duplicates when all hashes are empty or whitespace', async () => {
    const result = await checkDuplicateTracksAction(['', '   ', '']);
    expect(result).toEqual({ success: true, duplicates: [] });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('should filter out empty hashes and query with valid ones', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await checkDuplicateTracksAction(['abc123', '', 'def456']);

    expect(result.success).toBe(true);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        audioFileHash: { in: ['abc123', 'def456'] },
        deletedOn: null,
      },
      select: {
        id: true,
        title: true,
        audioUrl: true,
        audioFileHash: true,
        audioUploadStatus: true,
      },
    });
  });

  it('should return mapped duplicate info when tracks are found', async () => {
    const mockTracks = [
      {
        id: 'track-1',
        title: 'Existing Song',
        audioUrl: 'https://cdn.example.com/media/tracks/song.mp3',
        audioFileHash: 'hash-abc',
        audioUploadStatus: 'COMPLETED',
      },
      {
        id: 'track-2',
        title: 'Another Song',
        audioUrl: 'pending://upload',
        audioFileHash: 'hash-def',
        audioUploadStatus: 'PENDING',
      },
    ];

    mockFindMany.mockResolvedValue(mockTracks as never);
    mockExtractS3Key.mockReturnValueOnce('media/tracks/song.mp3').mockReturnValueOnce(null);

    const result = await checkDuplicateTracksAction(['hash-abc', 'hash-def']);

    expect(result.success).toBe(true);
    expect(result.duplicates).toHaveLength(2);
    expect(result.duplicates[0]).toEqual({
      audioFileHash: 'hash-abc',
      trackId: 'track-1',
      title: 'Existing Song',
      audioUrl: 'https://cdn.example.com/media/tracks/song.mp3',
      audioUploadStatus: 'COMPLETED',
      existingS3Key: 'media/tracks/song.mp3',
    });
    expect(result.duplicates[1]).toEqual({
      audioFileHash: 'hash-def',
      trackId: 'track-2',
      title: 'Another Song',
      audioUrl: 'pending://upload',
      audioUploadStatus: 'PENDING',
      existingS3Key: null,
    });
  });

  it('should return empty duplicates when no tracks match', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await checkDuplicateTracksAction(['nonexistent-hash']);

    expect(result.success).toBe(true);
    expect(result.duplicates).toEqual([]);
  });

  it('should handle database errors gracefully', async () => {
    const dbError = new Error('Connection refused');
    mockFindMany.mockRejectedValue(dbError);

    const result = await checkDuplicateTracksAction(['some-hash']);

    expect(result.success).toBe(false);
    expect(result.duplicates).toEqual([]);
    expect(result.error).toBe('Connection refused');
  });

  it('should handle non-Error exceptions', async () => {
    mockFindMany.mockRejectedValue('unexpected string error');

    const result = await checkDuplicateTracksAction(['some-hash']);

    expect(result.success).toBe(false);
    expect(result.duplicates).toEqual([]);
    expect(result.error).toBe('Failed to check duplicates');
  });

  it('should propagate requireRole rejection', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    await expect(checkDuplicateTracksAction(['hash'])).rejects.toThrow('Unauthorized');
  });
});
