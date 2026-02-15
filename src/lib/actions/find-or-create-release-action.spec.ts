/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only first to prevent errors from imported modules
import { findOrCreateReleaseAction, type ReleaseMetadata } from './find-or-create-release-action';
import { auth } from '../../../auth';
import { prisma } from '../prisma';
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
    },
  },
}));
vi.mock('../services/release-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('next/cache');

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockRequireRole = vi.mocked(requireRole);
const mockPrismaReleaseFindFirst = vi.mocked(prisma.release.findFirst) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Pick<Release, 'id' | 'title'> | null>>
>;
const mockReleaseServiceCreate = vi.mocked(ReleaseService.createRelease);

describe('findOrCreateReleaseAction', () => {
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
        },
      });
    });

    it('should find release case-insensitively', async () => {
      const existingRelease = {
        id: 'release-123',
        title: 'The Best Album',
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
});
