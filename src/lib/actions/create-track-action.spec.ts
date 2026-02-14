// Mock server-only and prisma first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';

import { createTrackAction } from './create-track-action';
import { prisma } from '../prisma';
import { TrackService } from '../services/track-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
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
    trackArtist: {
      createMany: vi.fn(),
    },
    releaseTrack: {
      createMany: vi.fn(),
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
vi.mock('../services/track-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('@/lib/utils/auth/get-action-state');
vi.mock('../utils/auth/require-role');

describe('createTrackAction', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  const mockFormData = new FormData();
  mockFormData.append('title', 'Test Track');
  mockFormData.append('duration', '225');
  mockFormData.append('audioUrl', 'https://example.com/audio.mp3');
  mockFormData.append('coverArt', 'https://example.com/cover.jpg');
  mockFormData.append('position', '1');

  const initialFormState: FormState = {
    fields: {},
    success: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('Authorization', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(createTrackAction(initialFormState, mockFormData)).rejects.toThrow(
        'Unauthorized'
      );

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should allow admin users to create tracks', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      const result = await createTrackAction(initialFormState, mockFormData);

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
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(getActionState).toHaveBeenCalledWith(
        mockFormData,
        [
          'title',
          'duration',
          'audioUrl',
          'coverArt',
          'position',
          'artistIds',
          'releaseIds',
          'publishedOn',
        ],
        expect.anything()
      );
    });

    it('should return validation errors when data is invalid', async () => {
      const mockFormState = {
        fields: {},
        success: false,
        errors: { title: ['Title is required'] },
      };

      vi.mocked(getActionState).mockReturnValue({
        formState: mockFormState,
        parsed: { success: false, error: {} },
      } as never);

      const result = await createTrackAction(initialFormState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(TrackService.createTrack).not.toHaveBeenCalled();
    });
  });

  describe('Track Creation', () => {
    it('should create track successfully with all fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            coverArt: 'https://example.com/cover.jpg',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      const result = await createTrackAction(initialFormState, mockFormData);

      expect(TrackService.createTrack).toHaveBeenCalledWith({
        title: 'Test Track',
        duration: 225,
        audioUrl: 'https://example.com/audio.mp3',
        coverArt: 'https://example.com/cover.jpg',
        position: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data?.trackId).toBe('track-123');
      expect(result.errors).toBeUndefined();
    });

    it('should create track with minimal required fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 180,
            audioUrl: 'https://example.com/audio.mp3',
            position: 0,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      const result = await createTrackAction(initialFormState, mockFormData);

      expect(TrackService.createTrack).toHaveBeenCalledWith({
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/audio.mp3',
        coverArt: undefined,
        position: 0,
      });

      expect(result.success).toBe(true);
    });

    it('should handle empty coverArt as undefined', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 180,
            audioUrl: 'https://example.com/audio.mp3',
            coverArt: '',
            position: 0,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(TrackService.createTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          coverArt: undefined,
        })
      );
    });

    it('should handle track creation failure from service', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: false,
        error: 'Track with this title already exists',
      } as never);

      const result = await createTrackAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual([
        'This title is already in use. Please choose a different one.',
      ]);
    });

    it('should handle service returning generic error', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      } as never);

      const result = await createTrackAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to create track']);
    });

    it('should handle service returning error without message', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: false,
      } as never);

      const result = await createTrackAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to create track']);
    });

    it('should use default position when position is undefined', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: undefined,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(TrackService.createTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          position: 0,
        })
      );
    });
  });

  describe('Security Logging', () => {
    it('should log successful track creation', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            coverArt: 'https://example.com/cover.jpg',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.created',
        userId: 'user-123',
        metadata: {
          createdFields: ['title', 'duration', 'audioUrl', 'coverArt', 'position'],
          success: true,
        },
      });
    });

    it('should log failed track creation attempt', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.created',
        userId: 'user-123',
        metadata: {
          createdFields: ['title', 'duration', 'audioUrl', 'position'],
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
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
            coverArt: undefined,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.created',
        userId: 'user-123',
        metadata: {
          createdFields: ['title', 'duration', 'audioUrl', 'position'],
          success: true,
        },
      });
    });
  });

  describe('Cache Revalidation', () => {
    it('should revalidate track creation page on success', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/tracks/new');
    });

    it('should revalidate track creation page on failure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/tracks/new');
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockRejectedValue(Error('Unexpected error'));

      await createTrackAction(initialFormState, mockFormData);

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
        vi.mocked(requireRole).mockResolvedValue(mockSession as never);

        vi.mocked(getActionState).mockReturnValue({
          formState: { fields: {}, success: false },
          parsed: {
            success: true,
            data: {
              title: 'Test Track',
              duration: 225,
              audioUrl: 'https://example.com/audio.mp3',
              position: 1,
            },
          },
        } as never);

        vi.mocked(TrackService.createTrack).mockResolvedValue({
          success: false,
          error: errorMessage,
        } as never);

        const result = await createTrackAction(initialFormState, mockFormData);

        expect(result.errors?.title).toEqual([
          'This title is already in use. Please choose a different one.',
        ]);
      }
    });
  });

  describe('Artist and Release Associations', () => {
    it('should create TrackArtist associations when artistIds provided', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
            artistIds: ['artist-1', 'artist-2'],
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(prisma.trackArtist.createMany).toHaveBeenCalledWith({
        data: [
          { artistId: 'artist-1', trackId: 'track-123' },
          { artistId: 'artist-2', trackId: 'track-123' },
        ],
      });
    });

    it('should create ReleaseTrack associations when releaseIds provided', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
            releaseIds: ['release-1', 'release-2'],
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(prisma.releaseTrack.createMany).toHaveBeenCalledWith({
        data: [
          { releaseId: 'release-1', trackId: 'track-123', position: 1 },
          { releaseId: 'release-2', trackId: 'track-123', position: 1 },
        ],
      });
    });

    it('should not create associations when artistIds is empty', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
            artistIds: [],
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { id: 'track-123' },
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(prisma.trackArtist.createMany).not.toHaveBeenCalled();
    });

    it('should not create associations when track creation fails', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Track',
            duration: 225,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
            artistIds: ['artist-1'],
            releaseIds: ['release-1'],
          },
        },
      } as never);

      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: false,
      } as never);

      await createTrackAction(initialFormState, mockFormData);

      expect(prisma.trackArtist.createMany).not.toHaveBeenCalled();
      expect(prisma.releaseTrack.createMany).not.toHaveBeenCalled();
    });
  });
});
