/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  findOrCreateArtistAction,
  type FindOrCreateArtistOptions,
} from './find-or-create-artist-action';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';
import { requireRole } from '../utils/auth/require-role';

import type { Session } from 'next-auth';

// Mock server-only first to prevent errors from imported modules
vi.mock('server-only', () => ({}));

// Mock all dependencies
vi.mock('../prisma', () => ({
  prisma: {
    artist: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    artistRelease: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    trackArtist: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('next/cache');

const mockRequireRole = vi.mocked(requireRole);
const mockPrismaArtistFindFirst = vi.mocked(prisma.artist.findFirst);
const mockPrismaArtistFindUnique = vi.mocked(prisma.artist.findUnique);
const mockPrismaArtistCreate = vi.mocked(prisma.artist.create);
const mockPrismaArtistReleaseFindUnique = vi.mocked(prisma.artistRelease.findUnique);
const mockPrismaArtistReleaseCreate = vi.mocked(prisma.artistRelease.create);
const mockPrismaTrackArtistFindUnique = vi.mocked(prisma.trackArtist.findUnique);
const mockPrismaTrackArtistCreate = vi.mocked(prisma.trackArtist.create);
const mockLogSecurityEvent = vi.mocked(logSecurityEvent);

describe('findOrCreateArtistAction', () => {
  const mockAdminSession: Session = {
    user: {
      id: 'user-123',
      role: 'admin',
      name: 'Test Admin',
      email: 'admin@test.com',
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(mockAdminSession as never);
  });

  describe('validation', () => {
    it('should reject empty artist name', async () => {
      const result = await findOrCreateArtistAction('');

      expect(result).toEqual({
        success: false,
        error: 'Artist name is required',
      });
    });

    it('should reject whitespace-only artist name', async () => {
      const result = await findOrCreateArtistAction('   ');

      expect(result).toEqual({
        success: false,
        error: 'Artist name is required',
      });
    });

    it('should require admin role', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      await expect(findOrCreateArtistAction('Test Artist')).rejects.toThrow('Unauthorized');
    });
  });

  describe('finding existing artists', () => {
    it('should find existing artist by display name (case-insensitive)', async () => {
      mockPrismaArtistFindFirst.mockResolvedValue({
        id: 'artist-123',
        displayName: 'John Doe',
        firstName: 'John',
        surname: 'Doe',
      } as never);

      const result = await findOrCreateArtistAction('JOHN DOE');

      expect(result).toEqual({
        success: true,
        artistId: 'artist-123',
        artistName: 'John Doe',
        created: false,
        artistReleaseCreated: false,
        trackArtistCreated: false,
      });

      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'media.artist.found',
        userId: 'user-123',
        metadata: {
          artistId: 'artist-123',
          artistName: 'John Doe',
          searchedName: 'JOHN DOE',
          artistReleaseCreated: false,
          trackArtistCreated: false,
        },
      });
    });

    it('should construct display name from firstName and surname when displayName is null', async () => {
      mockPrismaArtistFindFirst.mockResolvedValue({
        id: 'artist-123',
        displayName: null,
        firstName: 'John',
        surname: 'Doe',
      } as never);

      const result = await findOrCreateArtistAction('John Doe');

      expect(result.artistName).toBe('John Doe');
    });

    it('should create ArtistRelease when releaseId is provided for existing artist', async () => {
      mockPrismaArtistFindFirst.mockResolvedValue({
        id: 'artist-123',
        displayName: 'Test Artist',
        firstName: 'Test',
        surname: 'Artist',
      } as never);
      mockPrismaArtistReleaseFindUnique.mockResolvedValue(null);
      mockPrismaArtistReleaseCreate.mockResolvedValue({
        id: 'ar-123',
        artistId: 'artist-123',
        releaseId: 'release-456',
      } as never);

      const options: FindOrCreateArtistOptions = { releaseId: 'release-456' };
      const result = await findOrCreateArtistAction('Test Artist', options);

      expect(result.artistReleaseCreated).toBe(true);
      expect(mockPrismaArtistReleaseCreate).toHaveBeenCalledWith({
        data: {
          artistId: 'artist-123',
          releaseId: 'release-456',
        },
      });
    });

    it('should not duplicate ArtistRelease if it already exists', async () => {
      mockPrismaArtistFindFirst.mockResolvedValue({
        id: 'artist-123',
        displayName: 'Test Artist',
        firstName: 'Test',
        surname: 'Artist',
      } as never);
      mockPrismaArtistReleaseFindUnique.mockResolvedValue({
        id: 'ar-existing',
        artistId: 'artist-123',
        releaseId: 'release-456',
      } as never);

      const options: FindOrCreateArtistOptions = { releaseId: 'release-456' };
      const result = await findOrCreateArtistAction('Test Artist', options);

      expect(result.artistReleaseCreated).toBe(false);
      expect(mockPrismaArtistReleaseCreate).not.toHaveBeenCalled();
    });

    it('should create TrackArtist when trackId is provided for existing artist', async () => {
      mockPrismaArtistFindFirst.mockResolvedValue({
        id: 'artist-123',
        displayName: 'Test Artist',
        firstName: 'Test',
        surname: 'Artist',
      } as never);
      mockPrismaTrackArtistFindUnique.mockResolvedValue(null);
      mockPrismaTrackArtistCreate.mockResolvedValue({
        id: 'ta-123',
        trackId: 'track-789',
        artistId: 'artist-123',
      } as never);

      const options: FindOrCreateArtistOptions = { trackId: 'track-789' };
      const result = await findOrCreateArtistAction('Test Artist', options);

      expect(result.trackArtistCreated).toBe(true);
      expect(mockPrismaTrackArtistCreate).toHaveBeenCalledWith({
        data: {
          trackId: 'track-789',
          artistId: 'artist-123',
        },
      });
    });

    it('should not duplicate TrackArtist if it already exists', async () => {
      mockPrismaArtistFindFirst.mockResolvedValue({
        id: 'artist-123',
        displayName: 'Test Artist',
        firstName: 'Test',
        surname: 'Artist',
      } as never);
      mockPrismaTrackArtistFindUnique.mockResolvedValue({
        id: 'ta-existing',
        trackId: 'track-789',
        artistId: 'artist-123',
      } as never);

      const options: FindOrCreateArtistOptions = { trackId: 'track-789' };
      const result = await findOrCreateArtistAction('Test Artist', options);

      expect(result.trackArtistCreated).toBe(false);
      expect(mockPrismaTrackArtistCreate).not.toHaveBeenCalled();
    });
  });

  describe('creating new artists', () => {
    beforeEach(() => {
      mockPrismaArtistFindFirst.mockResolvedValue(null);
    });

    it('should create new artist when none exists', async () => {
      mockPrismaArtistFindUnique.mockResolvedValue(null); // No existing slug
      mockPrismaArtistCreate.mockResolvedValue({
        id: 'new-artist-123',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
      } as never);

      const result = await findOrCreateArtistAction('John Doe');

      expect(result).toEqual({
        success: true,
        artistId: 'new-artist-123',
        artistName: 'John Doe',
        created: true,
        artistReleaseCreated: false,
        trackArtistCreated: false,
      });

      expect(mockPrismaArtistCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'John',
          surname: 'Doe',
          displayName: 'John Doe',
          slug: 'john-doe',
          isActive: true,
          createdBy: 'user-123',
        }),
      });

      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'media.artist.created',
        userId: 'user-123',
        metadata: expect.objectContaining({
          artistId: 'new-artist-123',
          artistName: 'John Doe',
          slug: 'john-doe',
          source: 'bulk-upload',
        }),
      });
    });

    it('should handle single-name artists (like Madonna)', async () => {
      mockPrismaArtistFindUnique.mockResolvedValue(null);
      mockPrismaArtistCreate.mockResolvedValue({
        id: 'new-artist-123',
        firstName: 'Madonna',
        surname: 'Madonna',
        displayName: 'Madonna',
        slug: 'madonna',
      } as never);

      const result = await findOrCreateArtistAction('Madonna');

      expect(mockPrismaArtistCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'Madonna',
          surname: 'Madonna',
          displayName: 'Madonna',
          slug: 'madonna',
        }),
      });

      expect(result.artistName).toBe('Madonna');
    });

    it('should handle multi-word surnames', async () => {
      mockPrismaArtistFindUnique.mockResolvedValue(null);
      mockPrismaArtistCreate.mockResolvedValue({
        id: 'new-artist-123',
        firstName: 'David',
        surname: 'Lee Roth',
        displayName: 'David Lee Roth',
        slug: 'david-lee-roth',
      } as never);

      await findOrCreateArtistAction('David Lee Roth');

      expect(mockPrismaArtistCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'David',
          surname: 'Lee Roth',
          displayName: 'David Lee Roth',
        }),
      });
    });

    it('should generate unique slug when collision detected', async () => {
      mockPrismaArtistFindUnique
        .mockResolvedValueOnce({ id: 'existing-artist' } as never) // First slug exists
        .mockResolvedValueOnce(null); // Second slug is available
      mockPrismaArtistCreate.mockResolvedValue({
        id: 'new-artist-123',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe-1',
      } as never);

      await findOrCreateArtistAction('John Doe');

      expect(mockPrismaArtistCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'john-doe-1',
        }),
      });
    });

    it('should create artist with ArtistRelease when releaseId provided', async () => {
      mockPrismaArtistFindUnique.mockResolvedValue(null);
      mockPrismaArtistCreate.mockResolvedValue({
        id: 'new-artist-123',
        firstName: 'Test',
        surname: 'Artist',
        displayName: 'Test Artist',
        slug: 'test-artist',
      } as never);

      const options: FindOrCreateArtistOptions = { releaseId: 'release-456' };
      const result = await findOrCreateArtistAction('Test Artist', options);

      expect(result.artistReleaseCreated).toBe(true);
      expect(mockPrismaArtistCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          releases: {
            create: {
              releaseId: 'release-456',
            },
          },
        }),
      });
    });

    it('should create artist with TrackArtist when trackId provided', async () => {
      mockPrismaArtistFindUnique.mockResolvedValue(null);
      mockPrismaArtistCreate.mockResolvedValue({
        id: 'new-artist-123',
        firstName: 'Test',
        surname: 'Artist',
        displayName: 'Test Artist',
        slug: 'test-artist',
      } as never);

      const options: FindOrCreateArtistOptions = { trackId: 'track-789' };
      const result = await findOrCreateArtistAction('Test Artist', options);

      expect(result.trackArtistCreated).toBe(true);
      expect(mockPrismaArtistCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          trackArtists: {
            create: {
              trackId: 'track-789',
            },
          },
        }),
      });
    });

    it('should create artist with both ArtistRelease and TrackArtist', async () => {
      mockPrismaArtistFindUnique.mockResolvedValue(null);
      mockPrismaArtistCreate.mockResolvedValue({
        id: 'new-artist-123',
        firstName: 'Test',
        surname: 'Artist',
        displayName: 'Test Artist',
        slug: 'test-artist',
      } as never);

      const options: FindOrCreateArtistOptions = {
        releaseId: 'release-456',
        trackId: 'track-789',
      };
      const result = await findOrCreateArtistAction('Test Artist', options);

      expect(result.artistReleaseCreated).toBe(true);
      expect(result.trackArtistCreated).toBe(true);
    });
  });

  describe('slug generation', () => {
    beforeEach(() => {
      mockPrismaArtistFindFirst.mockResolvedValue(null);
      mockPrismaArtistFindUnique.mockResolvedValue(null);
    });

    it('should generate clean slug from artist name', async () => {
      mockPrismaArtistCreate.mockResolvedValue({
        id: 'new-artist-123',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
      } as never);

      await findOrCreateArtistAction('John Doe');

      expect(mockPrismaArtistCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'john-doe',
        }),
      });
    });

    it('should remove special characters from slug', async () => {
      mockPrismaArtistCreate.mockResolvedValue({
        id: 'new-artist-123',
        firstName: 'John',
        surname: 'OBrien',
        displayName: 'John OBrien',
        slug: 'john-obrien',
      } as never);

      await findOrCreateArtistAction('John OBrien');

      expect(mockPrismaArtistCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'john-obrien',
        }),
      });
    });
  });

  describe('transaction support', () => {
    it('should use provided transaction client', async () => {
      const mockTx = {
        artist: {
          findFirst: vi.fn().mockResolvedValue(null),
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: 'new-artist-123',
            firstName: 'Test',
            surname: 'Artist',
            displayName: 'Test Artist',
            slug: 'test-artist',
          }),
        },
        artistRelease: {
          findUnique: vi.fn(),
          create: vi.fn(),
        },
        trackArtist: {
          findUnique: vi.fn(),
          create: vi.fn(),
        },
      };

      const options: FindOrCreateArtistOptions = { tx: mockTx as never };
      await findOrCreateArtistAction('Test Artist', options);

      expect(mockTx.artist.findFirst).toHaveBeenCalled();
      expect(mockTx.artist.create).toHaveBeenCalled();
      expect(mockPrismaArtistFindFirst).not.toHaveBeenCalled();
      expect(mockPrismaArtistCreate).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrismaArtistFindFirst.mockRejectedValue(new Error('Database connection failed'));

      const result = await findOrCreateArtistAction('Test Artist');

      expect(result).toEqual({
        success: false,
        error: 'Failed to find or create artist',
      });
    });

    it('should handle unknown errors', async () => {
      mockPrismaArtistFindFirst.mockRejectedValue('Unknown error');

      const result = await findOrCreateArtistAction('Test Artist');

      expect(result).toEqual({
        success: false,
        error: 'Failed to find or create artist',
      });
    });

    it('should throw error when slug generation exceeds max attempts', async () => {
      // No existing artist with this name
      mockPrismaArtistFindFirst.mockResolvedValue(null);
      // Every slug check returns an existing artist (all taken)
      mockPrismaArtistFindUnique.mockResolvedValue({ id: 'existing-id' } as never);

      const result = await findOrCreateArtistAction('Test Artist');

      expect(result).toEqual({
        success: false,
        error: 'Failed to find or create artist',
      });
    });
  });
});
