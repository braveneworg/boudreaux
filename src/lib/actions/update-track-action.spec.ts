/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only and prisma first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';

import { updateTrackAction } from './update-track-action';
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
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    releaseTrack: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
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

describe('updateTrackAction', () => {
  const mockTrackId = '507f1f77bcf86cd799439011';

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
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
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

    it('should reject invalid trackId format', async () => {
      const result = await updateTrackAction('invalid-id', initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Invalid track ID']);
      expect(TrackService.updateTrack).not.toHaveBeenCalled();
    });

    it('should allow admin users to update tracks', async () => {
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

    it('should initialize formState.errors when it is undefined', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: {
            issues: [{ path: ['title'], message: 'Title is required' }],
          },
        },
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.title).toEqual(['Title is required']);
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

    it('should accumulate multiple errors for the same field', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: {
          success: false,
          error: {
            issues: [
              { path: ['title'], message: 'Title is required' },
              { path: ['title'], message: 'Title must be at least 2 characters' },
            ],
          },
        },
      } as never);

      const result = await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual([
        'Title is required',
        'Title must be at least 2 characters',
      ]);
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
      expect(result.errors?.general).toEqual(['Failed to update track']);
    });

    it('should initialize formState.errors when service returns failure and errors is undefined', async () => {
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
      expect(result.errors).toBeDefined();
      expect(result.errors?.general).toEqual(['Failed to update track']);
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
        vi.mocked(requireRole).mockResolvedValue(mockSession as never);

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

  describe('Artist and Release Associations', () => {
    it('should sync TrackArtist associations - add new, remove old', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
            artistIds: ['artist-2', 'artist-3'],
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      vi.mocked(prisma.trackArtist.findMany).mockResolvedValue([
        { id: 'ta-1', artistId: 'artist-1' },
        { id: 'ta-2', artistId: 'artist-2' },
      ] as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(prisma.trackArtist.findMany).toHaveBeenCalledWith({
        where: { trackId: mockTrackId },
        select: { id: true, artistId: true },
      });

      expect(prisma.trackArtist.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['ta-1'] } },
      });

      expect(prisma.trackArtist.createMany).toHaveBeenCalledWith({
        data: [{ artistId: 'artist-3', trackId: mockTrackId }],
      });
    });

    it('should sync ReleaseTrack associations - add new, remove old', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
            releaseIds: ['release-2', 'release-3'],
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      vi.mocked(prisma.releaseTrack.findMany).mockResolvedValue([
        { id: 'rt-1', releaseId: 'release-1' },
        { id: 'rt-2', releaseId: 'release-2' },
      ] as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(prisma.releaseTrack.findMany).toHaveBeenCalledWith({
        where: { trackId: mockTrackId },
        select: { id: true, releaseId: true },
      });

      expect(prisma.releaseTrack.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['rt-1'] } },
      });

      expect(prisma.releaseTrack.createMany).toHaveBeenCalledWith({
        data: [{ releaseId: 'release-3', trackId: mockTrackId, position: 2 }],
      });
    });

    it('should not delete associations when all existing are kept', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
            artistIds: ['artist-1', 'artist-2'],
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      vi.mocked(prisma.trackArtist.findMany).mockResolvedValue([
        { id: 'ta-1', artistId: 'artist-1' },
        { id: 'ta-2', artistId: 'artist-2' },
      ] as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(prisma.trackArtist.deleteMany).not.toHaveBeenCalled();
    });

    it('should only delete artist associations without creating new ones', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
            artistIds: [],
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      vi.mocked(prisma.trackArtist.findMany).mockResolvedValue([
        { id: 'ta-1', artistId: 'artist-1' },
      ] as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(prisma.trackArtist.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['ta-1'] } },
      });
      expect(prisma.trackArtist.createMany).not.toHaveBeenCalled();
    });

    it('should only create artist associations without deleting any', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
            artistIds: ['artist-1', 'artist-2'],
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      vi.mocked(prisma.trackArtist.findMany).mockResolvedValue([] as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(prisma.trackArtist.deleteMany).not.toHaveBeenCalled();
      expect(prisma.trackArtist.createMany).toHaveBeenCalledWith({
        data: [
          { artistId: 'artist-1', trackId: mockTrackId },
          { artistId: 'artist-2', trackId: mockTrackId },
        ],
      });
    });

    it('should only delete release associations without creating new ones', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
            releaseIds: [],
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      vi.mocked(prisma.releaseTrack.findMany).mockResolvedValue([
        { id: 'rt-1', releaseId: 'release-1' },
      ] as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(prisma.releaseTrack.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['rt-1'] } },
      });
      expect(prisma.releaseTrack.createMany).not.toHaveBeenCalled();
    });

    it('should only create release associations without deleting any', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/audio.mp3',
            position: 1,
            releaseIds: ['release-1', 'release-2'],
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      vi.mocked(prisma.releaseTrack.findMany).mockResolvedValue([] as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(prisma.releaseTrack.deleteMany).not.toHaveBeenCalled();
      expect(prisma.releaseTrack.createMany).toHaveBeenCalledWith({
        data: [
          { releaseId: 'release-1', trackId: mockTrackId, position: 1 },
          { releaseId: 'release-2', trackId: mockTrackId, position: 1 },
        ],
      });
    });

    it('should use default position 0 for release associations when position is undefined', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/audio.mp3',
            position: undefined,
            releaseIds: ['release-1'],
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { id: mockTrackId },
      } as never);

      vi.mocked(prisma.releaseTrack.findMany).mockResolvedValue([] as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(prisma.releaseTrack.createMany).toHaveBeenCalledWith({
        data: [{ releaseId: 'release-1', trackId: mockTrackId, position: 0 }],
      });
    });

    it('should not sync associations when update fails', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Track',
            duration: 300,
            audioUrl: 'https://example.com/updated-audio.mp3',
            position: 2,
            artistIds: ['artist-1'],
            releaseIds: ['release-1'],
          },
        },
      } as never);

      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await updateTrackAction(mockTrackId, initialFormState, mockFormData);

      expect(prisma.trackArtist.findMany).not.toHaveBeenCalled();
      expect(prisma.releaseTrack.findMany).not.toHaveBeenCalled();
    });
  });
});
