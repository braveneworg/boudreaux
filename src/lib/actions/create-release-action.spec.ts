/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';

import { createReleaseAction } from './create-release-action';
import { prisma } from '../prisma';
import { ReleaseService } from '../services/release-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { requireRole } from '../utils/auth/require-role';

import type { FormState } from '../types/form-state';

vi.mock('server-only', () => ({}));
vi.mock('../prisma', () => ({
  prisma: {
    artistRelease: {
      createMany: vi.fn(),
    },
  },
}));

// Mock all dependencies
vi.mock('next/cache');

vi.mock('../services/release-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('@/lib/utils/auth/get-action-state');
vi.mock('../utils/auth/require-role');

describe('createReleaseAction', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  const mockFormData = new FormData();
  mockFormData.append('title', 'Test Album');
  mockFormData.append('releasedOn', '2024-01-15');
  mockFormData.append('coverArt', 'https://example.com/cover.jpg');
  mockFormData.append('formats', 'DIGITAL');
  mockFormData.append('labels', 'Test Label');
  mockFormData.append('catalogNumber', 'CAT-001');
  mockFormData.append('description', 'A test album');

  const initialFormState: FormState = {
    fields: {},
    success: false,
  };

  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('Authorization', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(createReleaseAction(initialFormState, mockFormData)).rejects.toThrow(
        'Unauthorized'
      );

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should allow admin users to create releases', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      const result = await createReleaseAction(initialFormState, mockFormData);

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
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(getActionState).toHaveBeenCalledWith(
        mockFormData,
        [
          'title',
          'releasedOn',
          'coverArt',
          'formats',
          'artistIds',
          'labels',
          'catalogNumber',
          'description',
          'publishedAt',
          'suggestedPrice',
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

      const result = await createReleaseAction(initialFormState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(ReleaseService.createRelease).not.toHaveBeenCalled();
    });
  });

  describe('Release Creation', () => {
    it('should create release successfully with all fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL', 'VINYL'],
            labels: 'Label 1, Label 2',
            catalogNumber: 'CAT-001',
            description: 'A test album',
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      const result = await createReleaseAction(initialFormState, mockFormData);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith({
        title: 'Test Album',
        releasedOn: expect.any(Date),
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL', 'VINYL'],
        labels: ['Label 1', 'Label 2'],
        catalogNumber: 'CAT-001',
        description: 'A test album',
      });

      expect(result.success).toBe(true);
      expect(result.data?.releaseId).toBe('release-123');
      expect(result.errors).toBeUndefined();
    });

    it('should create release with minimal required fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      const result = await createReleaseAction(initialFormState, mockFormData);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith({
        title: 'Test Album',
        releasedOn: expect.any(Date),
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL'],
        labels: [],
        catalogNumber: undefined,
        description: undefined,
      });

      expect(result.success).toBe(true);
    });

    it('should parse comma-separated labels into array', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            labels: 'Label 1, Label 2, Label 3',
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['Label 1', 'Label 2', 'Label 3'],
        })
      );
    });

    it('should handle empty labels string', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            labels: '',
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: [],
        })
      );
    });

    it('should handle release creation failure from service', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
        error: 'Release with this title already exists',
      } as never);

      const result = await createReleaseAction(initialFormState, mockFormData);

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
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      } as never);

      const result = await createReleaseAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to create release']);
    });

    it('should handle service returning error without message', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
      } as never);

      const result = await createReleaseAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to create release']);
    });

    it('should preserve existing errors object when service fails', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false, errors: { someField: ['prior error'] } },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      } as never);

      const result = await createReleaseAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to create release']);
    });

    it('should use default format when formats is undefined', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: undefined,
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          formats: ['DIGITAL'],
        })
      );
    });
  });

  describe('Security Logging', () => {
    it('should log successful release creation', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            labels: 'Test Label',
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.release.created',
        userId: 'user-123',
        metadata: {
          createdFields: ['title', 'releasedOn', 'coverArt', 'formats', 'labels'],
          success: true,
        },
      });
    });

    it('should log failed release creation attempt', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.release.created',
        userId: 'user-123',
        metadata: {
          createdFields: ['title', 'releasedOn', 'coverArt', 'formats'],
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
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            labels: undefined,
            catalogNumber: undefined,
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.release.created',
        userId: 'user-123',
        metadata: {
          createdFields: ['title', 'releasedOn', 'coverArt', 'formats'],
          success: true,
        },
      });
    });
  });

  describe('Cache Revalidation', () => {
    it('should revalidate release creation page on success', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/releases/new');
    });

    it('should revalidate release creation page on failure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/releases/new');
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockRejectedValue(Error('Unexpected error'));

      await createReleaseAction(initialFormState, mockFormData);

      expect(setUnknownError).toHaveBeenCalled();
    });

    it('should detect title uniqueness error with various message formats', async () => {
      const errorMessages = [
        'Title is not unique',
        'A release with this title already exists',
        'Duplicate title found',
      ];

      for (const errorMessage of errorMessages) {
        vi.mocked(requireRole).mockResolvedValue(mockSession as never);

        vi.mocked(getActionState).mockReturnValue({
          formState: { fields: {}, success: false },
          parsed: {
            success: true,
            data: {
              title: 'Test Album',
              releasedOn: '2024-01-15',
              coverArt: 'https://example.com/cover.jpg',
              formats: ['DIGITAL'],
            },
          },
        } as never);

        vi.mocked(ReleaseService.createRelease).mockResolvedValue({
          success: false,
          error: errorMessage,
        } as never);

        const result = await createReleaseAction(initialFormState, mockFormData);

        expect(result.errors?.title).toEqual([
          'This title is already in use. Please choose a different one.',
        ]);
      }
    });
  });

  describe('Artist Associations', () => {
    it('should create ArtistRelease associations when artistIds provided', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            artistIds: ['artist-1', 'artist-2'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(prisma.artistRelease.createMany).toHaveBeenCalledWith({
        data: [
          { artistId: 'artist-1', releaseId: 'release-123' },
          { artistId: 'artist-2', releaseId: 'release-123' },
        ],
      });
    });

    it('should not create associations when artistIds is empty', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            artistIds: [],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(prisma.artistRelease.createMany).not.toHaveBeenCalled();
    });

    it('should not create associations when release creation fails', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            artistIds: ['artist-1'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(prisma.artistRelease.createMany).not.toHaveBeenCalled();
    });

    it('should not create associations when artistIds is not provided', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(prisma.artistRelease.createMany).not.toHaveBeenCalled();
    });
  });

  describe('preGeneratedId', () => {
    it('should pass preGeneratedId to createRelease when a valid ObjectId is provided', async () => {
      const validObjectId = '507f1f77bcf86cd799439011';
      const formDataWithId = new FormData();
      formDataWithId.append('title', 'Test Album');
      formDataWithId.append('releasedOn', '2024-01-15');
      formDataWithId.append('coverArt', 'https://example.com/cover.jpg');
      formDataWithId.append('formats', 'DIGITAL');
      formDataWithId.append('preGeneratedId', validObjectId);

      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: validObjectId },
      } as never);

      await createReleaseAction(initialFormState, formDataWithId);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({ id: validObjectId })
      );
    });

    it('should not pass preGeneratedId when an invalid ObjectId is provided', async () => {
      const formDataWithBadId = new FormData();
      formDataWithBadId.append('title', 'Test Album');
      formDataWithBadId.append('releasedOn', '2024-01-15');
      formDataWithBadId.append('coverArt', 'https://example.com/cover.jpg');
      formDataWithBadId.append('formats', 'DIGITAL');
      formDataWithBadId.append('preGeneratedId', 'not-a-valid-id');

      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, formDataWithBadId);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.not.objectContaining({ id: expect.anything() })
      );
    });
  });

  describe('suggestedPrice', () => {
    it('should convert suggestedPrice from dollars to cents', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            suggestedPrice: '9.99',
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedPrice: 999 })
      );
    });

    it('should not include suggestedPriceCents when suggestedPrice is empty', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            suggestedPrice: '',
          },
        },
      } as never);

      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);

      await createReleaseAction(initialFormState, mockFormData);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedPrice: undefined })
      );
    });
  });
});
