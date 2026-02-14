// Mock server-only first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { updateReleaseAction } from './update-release-action';
import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { ReleaseService } from '../services/release-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import getActionState from '../utils/auth/get-action-state';
import { requireRole } from '../utils/auth/require-role';

import type { FormState } from '../types/form-state';

vi.mock('server-only', () => ({}));
vi.mock('../prisma', () => ({
  prisma: {
    artistRelease: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// Mock all dependencies
vi.mock('next/cache');
vi.mock('../../../auth');
vi.mock('../services/release-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('../utils/auth/get-action-state');
vi.mock('../utils/auth/require-role');

describe('updateReleaseAction', () => {
  const mockReleaseId = 'release-123';

  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  const mockFormData = new FormData();
  mockFormData.append('title', 'Updated Album');
  mockFormData.append('releasedOn', '2024-01-15');
  mockFormData.append('coverArt', 'https://example.com/cover.jpg');
  mockFormData.append('formats', 'DIGITAL');
  mockFormData.append('labels', 'Test Label');
  mockFormData.append('catalogNumber', 'CAT-001');
  mockFormData.append('description', 'Updated description');

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

      await expect(
        updateReleaseAction(mockReleaseId, initialFormState, mockFormData)
      ).rejects.toThrow('Unauthorized');

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not logged in', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'You must be a logged in admin user to update a release',
      ]);
    });

    it('should return error when user is not admin', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'user-123', role: 'user' },
      } as never);
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'You must be a logged in admin user to update a release',
      ]);
    });

    it('should allow admin users to update releases', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should validate form data with all permitted fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(getActionState).toHaveBeenCalledWith(
        mockFormData,
        [
          'title',
          'releasedOn',
          'coverArt',
          'formats',
          'artistIds',
          'groupIds',
          'labels',
          'catalogNumber',
          'description',
          'notes',
          'executiveProducedBy',
          'coProducedBy',
          'masteredBy',
          'mixedBy',
          'recordedBy',
          'artBy',
          'designBy',
          'photographyBy',
          'linerNotesBy',
          'publishedAt',
          'featuredOn',
          'featuredUntil',
          'featuredDescription',
        ],
        expect.anything()
      );
    });

    it('should return validation errors when data is invalid', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: {
            issues: [
              { path: ['title'], message: 'Title is required' },
              { path: ['coverArt'], message: 'Cover art URL is required' },
            ],
          },
        },
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual(['Title is required']);
      expect(result.errors?.coverArt).toEqual(['Cover art URL is required']);
      expect(ReleaseService.updateRelease).not.toHaveBeenCalled();
    });
  });

  describe('Release Update', () => {
    it('should update release successfully with all fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL', 'VINYL'],
            labels: 'Label 1, Label 2',
            catalogNumber: 'CAT-001',
            description: 'Updated description',
            notes: 'Note 1, Note 2',
            executiveProducedBy: 'Producer A',
            masteredBy: 'Engineer B',
            publishedAt: '2024-01-20T00:00:00.000Z',
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(ReleaseService.updateRelease).toHaveBeenCalledWith(mockReleaseId, {
        title: 'Updated Album',
        releasedOn: expect.any(Date),
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL', 'VINYL'],
        labels: ['Label 1', 'Label 2'],
        catalogNumber: 'CAT-001',
        description: 'Updated description',
        notes: ['Note 1', 'Note 2'],
        executiveProducedBy: ['Producer A'],
        coProducedBy: [],
        masteredBy: ['Engineer B'],
        mixedBy: [],
        recordedBy: [],
        artBy: [],
        designBy: [],
        photographyBy: [],
        linerNotesBy: [],
        publishedAt: expect.any(Date),
        featuredOn: undefined,
        featuredUntil: undefined,
        featuredDescription: undefined,
      });

      expect(result.success).toBe(true);
      expect(result.data?.releaseId).toBe(mockReleaseId);
    });

    it('should parse comma-separated credits fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            executiveProducedBy: 'Producer A, Producer B',
            coProducedBy: 'Co-Producer 1, Co-Producer 2',
            masteredBy: 'Engineer 1, Engineer 2, Engineer 3',
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(ReleaseService.updateRelease).toHaveBeenCalledWith(
        mockReleaseId,
        expect.objectContaining({
          executiveProducedBy: ['Producer A', 'Producer B'],
          coProducedBy: ['Co-Producer 1', 'Co-Producer 2'],
          masteredBy: ['Engineer 1', 'Engineer 2', 'Engineer 3'],
        })
      );
    });

    it('should handle empty credits fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            executiveProducedBy: '',
            masteredBy: '',
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(ReleaseService.updateRelease).toHaveBeenCalledWith(
        mockReleaseId,
        expect.objectContaining({
          executiveProducedBy: [],
          masteredBy: [],
        })
      );
    });

    it('should handle featured dates', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            featuredOn: '2024-02-01',
            featuredUntil: '2024-02-28',
            featuredDescription: 'Featured release of the month',
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(ReleaseService.updateRelease).toHaveBeenCalledWith(
        mockReleaseId,
        expect.objectContaining({
          featuredOn: expect.any(Date),
          featuredUntil: expect.any(Date),
          featuredDescription: 'Featured release of the month',
        })
      );
    });

    it('should handle release update failure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Database error']);
    });

    it('should handle title uniqueness error', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Duplicate Title',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Release title already exists',
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual([
        'This title is already in use. Please choose a different one.',
      ]);
    });

    it('should handle title unique constraint error', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Duplicate Title',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Title must be unique',
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual([
        'This title is already in use. Please choose a different one.',
      ]);
    });

    it('should handle duplicate title error', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Duplicate Title',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Duplicate title found',
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual([
        'This title is already in use. Please choose a different one.',
      ]);
    });

    it('should handle error with no message', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: undefined,
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to update release']);
    });

    it('should preserve existing errors on failure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false, errors: { existingField: ['Existing error'] } },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Database error']);
    });

    it('should initialize errors when undefined on failure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false }, // No errors property
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.general).toEqual(['Database error']);
    });

    it('should handle release not found error', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Release not found',
      } as never);

      const result = await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Release not found']);
    });
  });

  describe('Security Logging', () => {
    it('should log successful release update', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            labels: 'Test Label',
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.release.updated',
        userId: 'user-123',
        metadata: {
          releaseId: mockReleaseId,
          updatedFields: ['title', 'releasedOn', 'coverArt', 'formats', 'labels'],
          success: true,
        },
      });
    });

    it('should log failed release update', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Update failed',
      } as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.release.updated',
        userId: 'user-123',
        metadata: {
          releaseId: mockReleaseId,
          updatedFields: ['title', 'releasedOn', 'coverArt', 'formats'],
          success: false,
        },
      });
    });
  });

  describe('Cache Revalidation', () => {
    it('should revalidate release page on success', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith(`/admin/releases/${mockReleaseId}`);
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockRejectedValue(Error('Unexpected error'));

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(setUnknownError).toHaveBeenCalled();
    });
  });

  describe('Artist Associations', () => {
    it('should sync ArtistRelease associations - add new, remove old', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            artistIds: ['artist-2', 'artist-3'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      vi.mocked(prisma.artistRelease.findMany).mockResolvedValue([
        { id: 'ar-1', artistId: 'artist-1' },
        { id: 'ar-2', artistId: 'artist-2' },
      ] as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      // Should delete artist-1 (removed)
      expect(prisma.artistRelease.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['ar-1'] } },
      });

      // Should create artist-3 (new)
      expect(prisma.artistRelease.createMany).toHaveBeenCalledWith({
        data: [{ artistId: 'artist-3', releaseId: mockReleaseId }],
      });
    });

    it('should not delete associations when all existing are kept', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            artistIds: ['artist-1', 'artist-2'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      vi.mocked(prisma.artistRelease.findMany).mockResolvedValue([
        { id: 'ar-1', artistId: 'artist-1' },
        { id: 'ar-2', artistId: 'artist-2' },
      ] as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(prisma.artistRelease.deleteMany).not.toHaveBeenCalled();
      expect(prisma.artistRelease.createMany).not.toHaveBeenCalled();
    });

    it('should not sync associations when update fails', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            artistIds: ['artist-1'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      expect(prisma.artistRelease.findMany).not.toHaveBeenCalled();
    });

    it('should handle replacing all associations', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            artistIds: ['artist-3'],
          },
        },
      } as never);

      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { id: mockReleaseId },
      } as never);

      vi.mocked(prisma.artistRelease.findMany).mockResolvedValue([
        { id: 'ar-1', artistId: 'artist-1' },
        { id: 'ar-2', artistId: 'artist-2' },
      ] as never);

      await updateReleaseAction(mockReleaseId, initialFormState, mockFormData);

      // Should delete both existing
      expect(prisma.artistRelease.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['ar-1', 'ar-2'] } },
      });

      // Should create the new one
      expect(prisma.artistRelease.createMany).toHaveBeenCalledWith({
        data: [{ artistId: 'artist-3', releaseId: mockReleaseId }],
      });
    });
  });
});
