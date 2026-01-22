// Mock server-only and prisma first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { updateTrackAction } from './update-track-action';
import { auth } from '../../../auth';
import { TrackService } from '../services/track-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import getActionState from '../utils/auth/get-action-state';
import { requireRole } from '../utils/auth/require-role';

import type { FormState } from '../types/form-state';

vi.mock('server-only', () => ({}));
vi.mock('../prisma', () => ({
  prisma: {
    track: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    image: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('@prisma/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, options: { code: string; clientVersion: string }) {
        super(message);
        this.code = options.code;
      }
    },
    PrismaClientInitializationError: class PrismaClientInitializationError extends Error {
      constructor(message: string, _clientVersion: string) {
        super(message);
      }
    },
  },
}));

// Mock all dependencies
vi.mock('next/cache');
vi.mock('../../../auth');
vi.mock('../services/track-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('../utils/auth/get-action-state');
vi.mock('../utils/auth/require-role');

describe('updateTrackAction', () => {
  const mockTrackId = 'track-123';

  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  const mockFormData = new FormData();
  mockFormData.append('title', 'Updated Track');
  mockFormData.append('duration', '300');
  mockFormData.append('audioUrl', 'https://example.com/updated-audio.mp3');
  mockFormData.append('coverArt', 'https://example.com/updated-cover.jpg');
  mockFormData.append('position', '2');

  const initialFormState: FormState = {
    fields: {},
    success: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('Authorization', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(updateTrackAction(mockTrackId, initialFormState, mockFormData)).rejects.toThrow(
        'Unauthorized'
      );

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not logged in', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'You must be a logged in admin user to update a track',
      ]);
    });

    it('should return error when user is not admin', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'user-123', role: 'user', email: 'user@example.com' },
      } as never);
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'You must be a logged in admin user to update a track',
      ]);
    });

    it('should allow admin users to update tracks', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as never);
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should validate form data with permitted fields only', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(getActionState).toHaveBeenCalledWith(
        mockFormData,
        ['title', 'duration', 'audioUrl', 'coverArt', 'position', 'publishedOn'],
        expect.anything()
      );
    });

    it('should return validation errors when schema validation fails', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: {
            issues: [
              { path: ['title'], message: 'Title is required' },
              { path: ['duration'], message: 'Duration must be at least 1 second' },
            ],
          },
        },
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual(['Title is required']);
      expect(result.errors?.duration).toEqual(['Duration must be at least 1 second']);
      expect(TrackService.updateTrack).not.toHaveBeenCalled();
    });

    it('should handle errors without path as general errors', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: {
            issues: [{ path: [], message: 'Something went wrong' }],
          },
        },
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Something went wrong']);
    });
  });

  describe('Track Update', () => {
    it('should update track successfully with all fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            coverArt: 'https://example.com/updated-cover.jpg',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(TrackService.updateTrack).toHaveBeenCalledWith(mockTrackId, {
        title: 'Updated Track',
        duration: 300,
        audioUrl: 'https://example.com/updated-audio.mp3',
        coverArt: 'https://example.com/updated-cover.jpg',
        position: 2,
      });

      expect(result.success).toBe(true);
      expect(result.data?.trackId).toBe(mockTrackId);
      expect(result.errors).toBeUndefined();
    });

    it('should update track with publishedOn date', async () => {
      const publishedOn = '2024-01-15T12:00:00.000Z';
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
            publishedOn,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(TrackService.updateTrack).toHaveBeenCalledWith(mockTrackId, {
        title: 'Updated Track',
        duration: 300,
        audioUrl: 'https://example.com/updated-audio.mp3',
        coverArt: undefined,
        position: 2,
        publishedOn: expect.any(Date),
      });
    });

    it('should handle empty coverArt as undefined', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            coverArt: '',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(TrackService.updateTrack).toHaveBeenCalledWith(
        mockTrackId,
        expect.objectContaining({
          coverArt: undefined,
        })
      );
    });

    it('should handle track update failure from service with title uniqueness error', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Track with this title already exists',
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual([
        'This title is already in use. Please choose a different one.',
      ]);
    });

    it('should handle track not found error', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Track not found',
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Track not found']);
    });

    it('should handle service returning generic error', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Database connection failed']);
    });

    it('should handle service returning error without message', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to update track']);
    });

    it('should use default position when position is undefined', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: undefined,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(TrackService.updateTrack).toHaveBeenCalledWith(
        mockTrackId,
        expect.objectContaining({
          position: 0,
        })
      );
    });
  });

  describe('Security Logging', () => {
    it('should log successful track update', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            coverArt: 'https://example.com/updated-cover.jpg',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.updated',
        userId: 'user-123',
        metadata: {
          trackId: mockTrackId,
          updatedFields: ['title', 'duration', 'audioUrl', 'coverArt', 'position'],
          success: true,
        },
      });
    });

    it('should log failed track update attempt', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.updated',
        userId: 'user-123',
        metadata: {
          trackId: mockTrackId,
          updatedFields: ['title', 'duration', 'audioUrl', 'position'],
          success: false,
        },
      });
    });

    it('should filter out undefined fields in security log', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
            coverArt: undefined,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.updated',
        userId: 'user-123',
        metadata: {
          trackId: mockTrackId,
          updatedFields: ['title', 'duration', 'audioUrl', 'position'],
          success: true,
        },
      });
    });
  });

  describe('Cache Revalidation', () => {
    it('should revalidate track page on success', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith(`/admin/tracks/${mockTrackId}`);
    });

    it('should revalidate track page on failure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith(`/admin/tracks/${mockTrackId}`);
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockRejectedValue(Error('Unexpected error'));

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(setUnknownError).toHaveBeenCalled();
    });

    it('should detect title uniqueness error with various message formats', async () => {
      const errorMessages = [
        'Title is not unique',
        'A track with this title already exists',
        'Duplicate title found',
      ];

      for (const errorMessage of errorMessages) {
        vi.clearAllMocks();
        vi.mocked(requireRole).mockResolvedValue(undefined);
        vi.mocked(auth).mockResolvedValue(mockSession as never);

        vi.mocked(getActionState).mockReturnValue({
          formState: { fields: {}, success: false },
          parsed: {
            success: true,
            data: {
              title: 'Updated Track',
              duration: 300,
              audioUrl: 'https://example.com/updated-audio.mp3',
              position: 2,
            },
          },
        } as never);

        vi.mocked(TrackService.updateTrack).mockResolvedValue({
          success: false,
          error: errorMessage,
        } as never);

        const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

        expect(result.errors?.title).toEqual([
          'This title is already in use. Please choose a different one.',
        ]);
      }
    });
  });
});
