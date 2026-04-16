/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only first to prevent errors from imported modules
import { findOrCreateReleaseAction, type ReleaseMetadata } from './find-or-create-release-action';
import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { ArtistService } from '../services/artist-service';
import { ReleaseService } from '../services/release-service';
import { requireRole } from '../utils/auth/require-role';

import type { Release } from '@prisma/client';
import type { Session } from 'next-auth';

vi.mock('server-only', () => ({}));

// Mock all dependencies
vi.mock('../../../auth');
vi.mock('../prisma', () => ({
  prisma: {
    release: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('../services/release-service');
vi.mock('../services/artist-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('next/cache');

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockRequireRole = vi.mocked(requireRole);
const mockPrismaReleaseFindFirst = vi.mocked(prisma.release.findFirst) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Pick<Release, 'id' | 'title' | 'publishedAt' | 'deletedOn'> | null>>
>;
const mockPrismaReleaseUpdate = vi.mocked(prisma.release.update);
const mockReleaseServiceCreate = vi.mocked(ReleaseService.createRelease);

describe('findOrCreateReleaseAction', () => {
  beforeEach(() => {
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

    mockRequireRole.mockResolvedValue({
      user: {
        id: 'user-123',
        role: 'admin',
        name: 'Test Admin',
        email: 'admin@test.com',
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);
  });

  describe('validation', () => {
    it('should reject if album name is empty', async () => {
      const metadata: ReleaseMetadata = {
        album: '',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: false,
        error: 'Album name is required to find or create a release',
      });
    });

    it('should reject if album name is only whitespace', async () => {
      const metadata: ReleaseMetadata = {
        album: '   ',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: false,
        error: 'Album name is required to find or create a release',
      });
    });

    it('should require admin role', async () => {
      const metadata: ReleaseMetadata = {
        album: 'Test Album',
      };

      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      await expect(findOrCreateReleaseAction(metadata)).rejects.toThrow('Unauthorized');
      expect(mockRequireRole).toHaveBeenCalledWith('admin');
    });
  });

  describe('authentication', () => {
    it('should reject if session is missing', async () => {
      mockAuth.mockResolvedValue(null);

      const metadata: ReleaseMetadata = {
        album: 'Test Album',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: false,
        error: 'You must be a logged in admin user to manage releases',
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

      const metadata: ReleaseMetadata = {
        album: 'Test Album',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: false,
        error: 'You must be a logged in admin user to manage releases',
      });
    });
  });

  describe('finding existing release', () => {
    it('should return existing release when found by title', async () => {
      const existingRelease = {
        id: 'release-123',
        title: 'Test Album',
        publishedAt: new Date('2024-01-01'),
        deletedOn: null,
      };

      mockPrismaReleaseFindFirst.mockResolvedValue(existingRelease);

      const metadata: ReleaseMetadata = {
        album: 'Test Album',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'Test Album',
        created: false,
      });

      expect(mockPrismaReleaseFindFirst).toHaveBeenCalledWith({
        where: {
          title: {
            equals: 'Test Album',
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          title: true,
          publishedAt: true,
          deletedOn: true,
        },
      });
    });

    it('should find release case-insensitively', async () => {
      const existingRelease = {
        id: 'release-123',
        title: 'The Best Album',
        publishedAt: new Date('2024-01-01'),
        deletedOn: null,
      };

      mockPrismaReleaseFindFirst.mockResolvedValue(existingRelease);

      const metadata: ReleaseMetadata = {
        album: 'THE BEST ALBUM',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: true,
        releaseId: 'release-123',
        releaseTitle: 'The Best Album',
        created: false,
      });
    });

    it('should trim album name before searching', async () => {
      mockPrismaReleaseFindFirst.mockResolvedValue({
        id: 'release-123',
        title: 'Trimmed Album',
        publishedAt: null,
        deletedOn: null,
      });

      const metadata: ReleaseMetadata = {
        album: '  Trimmed Album  ',
      };

      await findOrCreateReleaseAction(metadata);

      expect(mockPrismaReleaseFindFirst).toHaveBeenCalledWith({
        where: {
          title: {
            equals: 'Trimmed Album',
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          title: true,
          publishedAt: true,
          deletedOn: true,
        },
      });
    });
  });

  describe('creating new release', () => {
    beforeEach(() => {
      mockPrismaReleaseFindFirst.mockResolvedValue(null);
    });

    it('should create a new release when not found', async () => {
      const createdRelease = {
        id: 'new-release-123',
        title: 'New Album',
        formats: ['DIGITAL'],
        labels: [],
        releasedOn: new Date(),
        coverArt: '',
      };

      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: createdRelease as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'New Album',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: true,
        releaseId: 'new-release-123',
        releaseTitle: 'New Album',
        created: true,
      });

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith({
        title: 'New Album',
        releasedOn: expect.any(Date),
        formats: ['DIGITAL'],
        labels: [],
        catalogNumber: undefined,
        coverArt: '',
      });
    });

    it('should include label in creation data', async () => {
      const createdRelease = {
        id: 'new-release-123',
        title: 'Album with Label',
        formats: ['DIGITAL'],
        labels: ['Record Co.'],
        releasedOn: new Date(),
        coverArt: '',
      };

      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: createdRelease as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'Album with Label',
        label: 'Record Co.',
      };

      await findOrCreateReleaseAction(metadata);

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['Record Co.'],
        })
      );
    });

    it('should include catalog number in creation data', async () => {
      const createdRelease = {
        id: 'new-release-123',
        title: 'Album with Catalog',
        formats: ['DIGITAL'],
        labels: [],
        catalogNumber: 'CAT-001',
        releasedOn: new Date(),
        coverArt: '',
      };

      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: createdRelease as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'Album with Catalog',
        catalogNumber: 'CAT-001',
      };

      await findOrCreateReleaseAction(metadata);

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          catalogNumber: 'CAT-001',
        })
      );
    });

    it('should parse year into releasedOn date', async () => {
      const createdRelease = {
        id: 'new-release-123',
        title: 'Album from 2023',
        formats: ['DIGITAL'],
        labels: [],
        releasedOn: new Date(2023, 0, 1),
        coverArt: '',
      };

      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: createdRelease as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'Album from 2023',
        year: 2023,
      };

      await findOrCreateReleaseAction(metadata);

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          releasedOn: new Date(2023, 0, 1),
        })
      );
    });

    it('should prefer full date over year when both provided', async () => {
      const createdRelease = {
        id: 'new-release-123',
        title: 'Album with Full Date',
        formats: ['DIGITAL'],
        labels: [],
        releasedOn: new Date('2023-06-15'),
        coverArt: '',
      };

      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: createdRelease as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'Album with Full Date',
        year: 2023,
        date: '2023-06-15',
      };

      await findOrCreateReleaseAction(metadata);

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          releasedOn: new Date('2023-06-15'),
        })
      );
    });

    it('should include cover art if provided', async () => {
      const createdRelease = {
        id: 'new-release-123',
        title: 'Album with Cover',
        formats: ['DIGITAL'],
        labels: [],
        coverArt: 'https://cdn.example.com/cover.jpg',
        releasedOn: new Date(),
      };

      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: createdRelease as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'Album with Cover',
        coverArt: 'https://cdn.example.com/cover.jpg',
      };

      await findOrCreateReleaseAction(metadata);

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          coverArt: 'https://cdn.example.com/cover.jpg',
        })
      );
    });

    it('should trim label and catalog number', async () => {
      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: {
          id: 'new-release-123',
          title: 'Album',
          formats: ['DIGITAL'],
          labels: ['Trimmed Label'],
          catalogNumber: 'CAT-001',
          releasedOn: new Date(),
          coverArt: '',
        } as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'Album',
        label: '  Trimmed Label  ',
        catalogNumber: '  CAT-001  ',
      };

      await findOrCreateReleaseAction(metadata);

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['Trimmed Label'],
          catalogNumber: 'CAT-001',
        })
      );
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockPrismaReleaseFindFirst.mockResolvedValue(null);
    });

    it('should handle release creation failure', async () => {
      mockReleaseServiceCreate.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const metadata: ReleaseMetadata = {
        album: 'Failed Album',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: false,
        error: 'Database error',
      });
    });

    it('should handle database query errors', async () => {
      mockPrismaReleaseFindFirst.mockRejectedValue(new Error('Connection failed'));

      const metadata: ReleaseMetadata = {
        album: 'Test Album',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: false,
        error: 'Connection failed',
      });
    });

    it('should handle unknown errors gracefully', async () => {
      mockPrismaReleaseFindFirst.mockRejectedValue('Unknown error type');

      const metadata: ReleaseMetadata = {
        album: 'Test Album',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      });
    });

    it('should handle invalid year values', async () => {
      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: {
          id: 'new-release-123',
          title: 'Album',
          formats: ['DIGITAL'],
          labels: [],
          releasedOn: new Date(),
          coverArt: '',
        } as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'Album',
        year: 1800, // Invalid year (too old)
      };

      await findOrCreateReleaseAction(metadata);

      // When year is invalid (1800), it defaults to current date
      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          releasedOn: expect.any(Date),
        })
      );
    });

    it('should handle invalid date strings', async () => {
      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: {
          id: 'new-release-123',
          title: 'Album',
          formats: ['DIGITAL'],
          labels: [],
          releasedOn: new Date(2023, 0, 1),
          coverArt: '',
        } as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'Album',
        date: 'not-a-valid-date',
        year: 2023, // Should fall back to year
      };

      await findOrCreateReleaseAction(metadata);

      // Should fall back to year when date is invalid
      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          releasedOn: new Date(2023, 0, 1),
        })
      );
    });
  });

  describe('soft-delete handling', () => {
    it('should un-delete a soft-deleted release when found', async () => {
      const softDeletedRelease = {
        id: 'release-deleted',
        title: 'Deleted Album',
        publishedAt: new Date('2024-01-01'),
        deletedOn: new Date('2024-06-01'),
      };

      mockPrismaReleaseFindFirst.mockResolvedValue(softDeletedRelease);

      const metadata: ReleaseMetadata = {
        album: 'Deleted Album',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: true,
        releaseId: 'release-deleted',
        releaseTitle: 'Deleted Album',
        created: false,
      });

      // Should clear deletedOn
      expect(mockPrismaReleaseUpdate).toHaveBeenCalledWith({
        where: { id: 'release-deleted' },
        data: { deletedOn: null },
      });
    });

    it('should un-delete and publish a soft-deleted unpublished release when publish requested', async () => {
      const softDeletedUnpublished = {
        id: 'release-deleted-unpub',
        title: 'Deleted Unpublished Album',
        publishedAt: null,
        deletedOn: new Date('2024-06-01'),
      };

      mockPrismaReleaseFindFirst.mockResolvedValue(softDeletedUnpublished);

      const metadata: ReleaseMetadata = {
        album: 'Deleted Unpublished Album',
      };

      const result = await findOrCreateReleaseAction(metadata, { publish: true });

      expect(result).toEqual({
        success: true,
        releaseId: 'release-deleted-unpub',
        releaseTitle: 'Deleted Unpublished Album',
        created: false,
      });

      // Should clear deletedOn AND set publishedAt
      expect(mockPrismaReleaseUpdate).toHaveBeenCalledWith({
        where: { id: 'release-deleted-unpub' },
        data: {
          deletedOn: null,
          publishedAt: expect.any(Date),
        },
      });
    });

    it('should not call update when release is active and already published', async () => {
      const activePublished = {
        id: 'release-active',
        title: 'Active Album',
        publishedAt: new Date('2024-01-01'),
        deletedOn: null,
      };

      mockPrismaReleaseFindFirst.mockResolvedValue(activePublished);

      const metadata: ReleaseMetadata = {
        album: 'Active Album',
      };

      await findOrCreateReleaseAction(metadata, { publish: true });

      // No update needed — already published and not deleted
      expect(mockPrismaReleaseUpdate).not.toHaveBeenCalled();
    });

    it('should not call update when release is active and publish is not requested', async () => {
      const activeUnpublished = {
        id: 'release-active-unpub',
        title: 'Active Unpublished',
        publishedAt: null,
        deletedOn: null,
      };

      mockPrismaReleaseFindFirst.mockResolvedValue(activeUnpublished);

      const metadata: ReleaseMetadata = {
        album: 'Active Unpublished',
      };

      await findOrCreateReleaseAction(metadata);

      // No publish requested and not deleted, so no update
      expect(mockPrismaReleaseUpdate).not.toHaveBeenCalled();
    });
  });

  describe('publish option', () => {
    it('should publish an unpublished active release when publish requested', async () => {
      const unpublishedRelease = {
        id: 'release-unpub',
        title: 'Unpublished Album',
        publishedAt: null,
        deletedOn: null,
      };

      mockPrismaReleaseFindFirst.mockResolvedValue(unpublishedRelease);

      const metadata: ReleaseMetadata = {
        album: 'Unpublished Album',
      };

      await findOrCreateReleaseAction(metadata, { publish: true });

      expect(mockPrismaReleaseUpdate).toHaveBeenCalledWith({
        where: { id: 'release-unpub' },
        data: { publishedAt: expect.any(Date) },
      });
    });

    it('should include publishedAt when creating a new release with publish option', async () => {
      mockPrismaReleaseFindFirst.mockResolvedValue(null);

      const createdRelease = {
        id: 'new-pub-release',
        title: 'New Published Album',
        formats: ['DIGITAL'],
        labels: [],
        releasedOn: new Date(),
        coverArt: '',
        publishedAt: new Date(),
      };

      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: createdRelease as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'New Published Album',
      };

      const result = await findOrCreateReleaseAction(metadata, { publish: true });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          publishedAt: expect.any(Date),
        })
      );
    });

    it('should return error with specific message when createRelease returns failure with error', async () => {
      mockPrismaReleaseFindFirst.mockResolvedValue(null);
      mockReleaseServiceCreate.mockResolvedValue({
        success: false,
        error: 'Title cannot be empty',
      } as never);

      const result = await findOrCreateReleaseAction({ album: 'New Album' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Title cannot be empty');
    });

    it('should return fallback error message when createRelease returns failure with empty error', async () => {
      mockPrismaReleaseFindFirst.mockResolvedValue(null);
      mockReleaseServiceCreate.mockResolvedValue({
        success: false,
        error: '',
      } as never);

      const result = await findOrCreateReleaseAction({ album: 'New Album' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create release');
    });

    it('should return fallback error message when createRelease returns failure with undefined error', async () => {
      mockPrismaReleaseFindFirst.mockResolvedValue(null);
      mockReleaseServiceCreate.mockResolvedValue({
        success: false,
      } as never);

      const result = await findOrCreateReleaseAction({ album: 'New Album' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create release');
    });

    it('should not include publishedAt when creating a new release without publish option', async () => {
      mockPrismaReleaseFindFirst.mockResolvedValue(null);

      const createdRelease = {
        id: 'new-draft-release',
        title: 'New Draft Album',
        formats: ['DIGITAL'],
        labels: [],
        releasedOn: new Date(),
        coverArt: '',
      };

      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: createdRelease as unknown as never,
      });

      const metadata: ReleaseMetadata = {
        album: 'New Draft Album',
      };

      await findOrCreateReleaseAction(metadata);

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          publishedAt: expect.anything(),
        })
      );
    });
  });

  describe('artist connection from metadata', () => {
    const createdRelease = {
      id: 'new-release-123',
      title: 'New Album',
      formats: ['DIGITAL'],
      labels: [],
      releasedOn: new Date(),
      coverArt: '',
    };

    beforeEach(() => {
      mockPrismaReleaseFindFirst.mockResolvedValue(null);
      mockReleaseServiceCreate.mockResolvedValue({
        success: true,
        data: createdRelease as unknown as never,
      });
    });

    it('should connect artist when albumArtist is provided', async () => {
      vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
        success: true,
        data: { id: 'artist-99', displayName: 'Ceschi', firstName: 'Ceschi', surname: '' },
      });
      vi.mocked(ArtistService.connectToRelease).mockResolvedValue(undefined);

      const result = await findOrCreateReleaseAction({
        album: 'New Album',
        albumArtist: 'Ceschi',
      });

      expect(result.success).toBe(true);
      expect(result.artistId).toBe('artist-99');
      expect(ArtistService.findOrCreateByName).toHaveBeenCalledWith('Ceschi');
      expect(ArtistService.connectToRelease).toHaveBeenCalledWith('artist-99', 'new-release-123');
    });

    it('should prefer albumArtist over artist', async () => {
      vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
        success: true,
        data: {
          id: 'artist-99',
          displayName: 'Album Artist',
          firstName: 'Album',
          surname: 'Artist',
        },
      });
      vi.mocked(ArtistService.connectToRelease).mockResolvedValue(undefined);

      await findOrCreateReleaseAction({
        album: 'New Album',
        albumArtist: 'Album Artist',
        artist: 'Track Artist',
      });

      expect(ArtistService.findOrCreateByName).toHaveBeenCalledWith('Album Artist');
    });

    it('should fall back to artist when albumArtist is empty', async () => {
      vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
        success: true,
        data: {
          id: 'artist-99',
          displayName: 'Track Artist',
          firstName: 'Track',
          surname: 'Artist',
        },
      });
      vi.mocked(ArtistService.connectToRelease).mockResolvedValue(undefined);

      await findOrCreateReleaseAction({
        album: 'New Album',
        artist: 'Track Artist',
      });

      expect(ArtistService.findOrCreateByName).toHaveBeenCalledWith('Track Artist');
    });

    it('should skip artist handling when no artist metadata', async () => {
      await findOrCreateReleaseAction({
        album: 'New Album',
      });

      expect(ArtistService.findOrCreateByName).not.toHaveBeenCalled();
    });

    it('should not fail release creation if artist creation fails', async () => {
      vi.mocked(ArtistService.findOrCreateByName).mockRejectedValue(new Error('DB error'));

      const result = await findOrCreateReleaseAction({
        album: 'New Album',
        albumArtist: 'Ceschi',
      });

      expect(result.success).toBe(true);
      expect(result.releaseId).toBe('new-release-123');
      expect(result.artistId).toBeUndefined();
    });

    it('should not fail release creation if findOrCreateByName returns failure', async () => {
      vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
        success: false,
        error: 'Artist name is empty',
      });

      const result = await findOrCreateReleaseAction({
        album: 'New Album',
        albumArtist: 'Ceschi',
      });

      expect(result.success).toBe(true);
      expect(result.artistId).toBeUndefined();
    });

    it('should connect artist when finding an existing release', async () => {
      mockPrismaReleaseFindFirst.mockResolvedValue({
        id: 'existing-release-456',
        title: 'Existing Album',
        publishedAt: new Date(),
        deletedOn: null,
      } as never);

      vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
        success: true,
        data: { id: 'artist-99', displayName: 'Ceschi', firstName: 'Ceschi', surname: '' },
      });
      vi.mocked(ArtistService.connectToRelease).mockResolvedValue(undefined);

      const result = await findOrCreateReleaseAction({
        album: 'Existing Album',
        albumArtist: 'Ceschi',
      });

      expect(result.success).toBe(true);
      expect(result.artistId).toBe('artist-99');
      expect(ArtistService.connectToRelease).toHaveBeenCalledWith(
        'artist-99',
        'existing-release-456'
      );
    });
  });
});
