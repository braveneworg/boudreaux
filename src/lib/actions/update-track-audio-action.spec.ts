// Mock server-only and prisma first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { AudioUploadStatus } from '@prisma/client';

import { updateTrackAudioAction, markTrackUploadingAction } from './update-track-audio-action';
import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';
import { requireRole } from '../utils/auth/require-role';

import type { Session } from 'next-auth';

vi.mock('server-only', () => ({}));
vi.mock('../prisma', () => ({
  prisma: {
    track: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@prisma/client', () => ({
  AudioUploadStatus: {
    PENDING: 'PENDING',
    UPLOADING: 'UPLOADING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
  },
}));

// Mock all dependencies
vi.mock('next/cache');
vi.mock('../../../auth');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');

const mockAuth = auth as unknown as ReturnType<typeof vi.fn<() => Promise<Session | null>>>;
const mockRequireRole = vi.mocked(requireRole);
const mockRevalidatePath = vi.mocked(revalidatePath);
const mockLogSecurityEvent = vi.mocked(logSecurityEvent);
const mockPrismaTrackFindUnique = vi.mocked(prisma.track.findUnique);
const mockPrismaTrackUpdate = vi.mocked(prisma.track.update);

describe('updateTrackAudioAction', () => {
  const mockTrackId = 'track-123';
  const mockAudioUrl = 'https://cdn.example.com/audio/track.mp3';

  const mockSession: Session = {
    user: {
      id: 'user-123',
      role: 'admin',
      name: 'Admin User',
      email: 'admin@example.com',
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  const mockTrack = {
    id: mockTrackId,
    title: 'Test Track',
    audioUploadStatus: AudioUploadStatus.PENDING,
    audioUrl: 'pending://upload',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession);
    mockRequireRole.mockResolvedValue();
  });

  describe('authorization', () => {
    it('should require admin role', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      await expect(updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED')).rejects.toThrow(
        'Unauthorized'
      );

      expect(mockRequireRole).toHaveBeenCalledWith('admin');
    });

    it('should reject if session is missing', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result).toEqual({
        success: false,
        error: 'You must be a logged in admin user to update tracks',
      });
    });

    it('should reject if user is not admin', async () => {
      mockAuth.mockResolvedValue({
        ...mockSession,
        user: { ...mockSession.user, role: 'user' },
      } as Session);

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result).toEqual({
        success: false,
        error: 'You must be a logged in admin user to update tracks',
      });
    });

    it('should reject if user id is missing', async () => {
      mockAuth.mockResolvedValue({
        ...mockSession,
        user: { ...mockSession.user, id: undefined },
      } as unknown as Session);

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result).toEqual({
        success: false,
        error: 'You must be a logged in admin user to update tracks',
      });
    });
  });

  describe('track validation', () => {
    it('should return error if track not found', async () => {
      mockPrismaTrackFindUnique.mockResolvedValue(null);

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result).toEqual({
        success: false,
        error: 'Track not found',
      });
    });

    it('should reject if track is already COMPLETED', async () => {
      mockPrismaTrackFindUnique.mockResolvedValue({
        ...mockTrack,
        audioUploadStatus: AudioUploadStatus.COMPLETED,
      } as never);

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result).toEqual({
        success: false,
        error: 'Track upload status is already COMPLETED',
      });
    });

    it('should allow update when track is FAILED', async () => {
      mockPrismaTrackFindUnique.mockResolvedValue({
        ...mockTrack,
        audioUploadStatus: AudioUploadStatus.FAILED,
      } as never);
      mockPrismaTrackUpdate.mockResolvedValue(mockTrack as never);

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result.success).toBe(true);
    });

    it('should allow update when track is PENDING', async () => {
      mockPrismaTrackFindUnique.mockResolvedValue({
        ...mockTrack,
        audioUploadStatus: AudioUploadStatus.PENDING,
      } as never);
      mockPrismaTrackUpdate.mockResolvedValue(mockTrack as never);

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result.success).toBe(true);
    });

    it('should allow update when track is UPLOADING', async () => {
      mockPrismaTrackFindUnique.mockResolvedValue({
        ...mockTrack,
        audioUploadStatus: AudioUploadStatus.UPLOADING,
      } as never);
      mockPrismaTrackUpdate.mockResolvedValue(mockTrack as never);

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result.success).toBe(true);
    });
  });

  describe('successful COMPLETED update', () => {
    beforeEach(() => {
      mockPrismaTrackFindUnique.mockResolvedValue(mockTrack as never);
      mockPrismaTrackUpdate.mockResolvedValue(mockTrack as never);
    });

    it('should update track with audioUrl and COMPLETED status', async () => {
      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(mockPrismaTrackUpdate).toHaveBeenCalledWith({
        where: { id: mockTrackId },
        data: {
          audioUrl: mockAudioUrl,
          audioUploadStatus: AudioUploadStatus.COMPLETED,
        },
      });

      expect(result).toEqual({
        success: true,
        trackId: mockTrackId,
      });
    });

    it('should log security event with correct metadata', async () => {
      await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.updated',
        userId: mockSession.user!.id,
        metadata: {
          trackId: mockTrackId,
          updateType: 'audio_upload',
          status: 'COMPLETED',
          audioUrl: mockAudioUrl,
          error: undefined,
        },
      });
    });

    it('should revalidate admin tracks path', async () => {
      await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/tracks');
    });
  });

  describe('successful FAILED update', () => {
    beforeEach(() => {
      mockPrismaTrackFindUnique.mockResolvedValue(mockTrack as never);
      mockPrismaTrackUpdate.mockResolvedValue(mockTrack as never);
    });

    it('should update track with existing audioUrl and FAILED status', async () => {
      const result = await updateTrackAudioAction(
        mockTrackId,
        mockAudioUrl,
        'FAILED',
        'Upload failed due to timeout'
      );

      expect(mockPrismaTrackUpdate).toHaveBeenCalledWith({
        where: { id: mockTrackId },
        data: {
          audioUrl: mockTrack.audioUrl, // Preserves existing audioUrl
          audioUploadStatus: AudioUploadStatus.FAILED,
        },
      });

      expect(result).toEqual({
        success: true,
        trackId: mockTrackId,
      });
    });

    it('should log security event with error message', async () => {
      const errorMessage = 'Upload failed due to timeout';
      await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'FAILED', errorMessage);

      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.updated',
        userId: mockSession.user!.id,
        metadata: {
          trackId: mockTrackId,
          updateType: 'audio_upload',
          status: 'FAILED',
          audioUrl: undefined, // No audioUrl logged for failed
          error: errorMessage,
        },
      });
    });

    it('should not include audioUrl in audit log for FAILED status', async () => {
      await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'FAILED');

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            audioUrl: undefined,
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockPrismaTrackFindUnique.mockResolvedValue(mockTrack as never);
    });

    it('should handle database update errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPrismaTrackUpdate.mockRejectedValue(new Error('Database error'));

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result).toEqual({
        success: false,
        error: 'Database error',
      });
      expect(consoleSpy).toHaveBeenCalledWith('Error updating track audio:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle unknown errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPrismaTrackUpdate.mockRejectedValue('Unknown error');

      const result = await updateTrackAudioAction(mockTrackId, mockAudioUrl, 'COMPLETED');

      expect(result).toEqual({
        success: false,
        error: 'Failed to update track audio',
      });

      consoleSpy.mockRestore();
    });
  });
});

describe('markTrackUploadingAction', () => {
  const mockTrackId = 'track-123';

  const mockSession: Session = {
    user: {
      id: 'user-123',
      role: 'admin',
      name: 'Admin User',
      email: 'admin@example.com',
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession);
    mockRequireRole.mockResolvedValue();
  });

  describe('authorization', () => {
    it('should require admin role', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      await expect(markTrackUploadingAction(mockTrackId)).rejects.toThrow('Unauthorized');

      expect(mockRequireRole).toHaveBeenCalledWith('admin');
    });

    it('should reject if session is missing', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await markTrackUploadingAction(mockTrackId);

      expect(result).toEqual({
        success: false,
        error: 'You must be a logged in admin user to update tracks',
      });
    });

    it('should reject if user is not admin', async () => {
      mockAuth.mockResolvedValue({
        ...mockSession,
        user: { ...mockSession.user, role: 'user' },
      } as Session);

      const result = await markTrackUploadingAction(mockTrackId);

      expect(result).toEqual({
        success: false,
        error: 'You must be a logged in admin user to update tracks',
      });
    });
  });

  describe('successful update', () => {
    it('should update track status to UPLOADING', async () => {
      mockPrismaTrackUpdate.mockResolvedValue({ id: mockTrackId } as never);

      const result = await markTrackUploadingAction(mockTrackId);

      expect(mockPrismaTrackUpdate).toHaveBeenCalledWith({
        where: { id: mockTrackId },
        data: {
          audioUploadStatus: AudioUploadStatus.UPLOADING,
        },
      });

      expect(result).toEqual({
        success: true,
        trackId: mockTrackId,
      });
    });
  });

  describe('error handling', () => {
    it('should handle database errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPrismaTrackUpdate.mockRejectedValue(new Error('Database error'));

      const result = await markTrackUploadingAction(mockTrackId);

      expect(result).toEqual({
        success: false,
        error: 'Database error',
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error marking track as uploading:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle unknown errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPrismaTrackUpdate.mockRejectedValue({ notAnError: true });

      const result = await markTrackUploadingAction(mockTrackId);

      expect(result).toEqual({
        success: false,
        error: 'Failed to update track status',
      });

      consoleSpy.mockRestore();
    });
  });
});
