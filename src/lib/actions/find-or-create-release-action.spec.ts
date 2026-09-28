/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only first to prevent errors from imported modules
import { auth } from '@/auth';
import { ArtistService } from '@/lib/services/artist-service';
import { CreditConfirmationService } from '@/lib/services/credit-confirmation-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { ReleaseScalars } from '@/lib/types/domain/release';
import { requireRole } from '@/utils/auth/require-role';

import { findOrCreateReleaseAction, type ReleaseMetadata } from './find-or-create-release-action';

/**
 * Minimal session shape these tests mock `auth()` with. The action only reads
 * `session.user.id` and `session.user.role`; this stand-in keeps the fixtures
 * type-safe without depending on the legacy auth library's `Session` type.
 */
interface Session {
  user: { id: string; role: string; name?: string; email?: string };
  expires: string;
}

vi.mock('server-only', () => ({}));

// Mock all dependencies
vi.mock('@/auth');
vi.mock('../services/release-service');
vi.mock('../services/artist-service');
vi.mock('../services/credit-confirmation-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('next/cache');

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;
const mockRequireRole = vi.mocked(requireRole);
const mockReleaseFindByTitle = vi.mocked(
  ReleaseService.findByTitleInsensitive
) as unknown as ReturnType<
  typeof vi.fn<
    () => Promise<Pick<ReleaseScalars, 'id' | 'title' | 'publishedAt' | 'deletedOn'> | null>
  >
>;
const mockRestoreFound = vi.mocked(ReleaseService.restoreFoundRelease);
const mockPublishRelease = vi.mocked(ReleaseService.publishRelease);
const mockForRelease = vi.mocked(CreditConfirmationService.forRelease);
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

    mockForRelease.mockResolvedValue({ success: true, data: { awaiting: [], stayHidden: [] } });

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

      mockReleaseFindByTitle.mockResolvedValue(existingRelease);

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

      expect(mockReleaseFindByTitle).toHaveBeenCalledWith('Test Album');
    });

    it('should find release case-insensitively', async () => {
      const existingRelease = {
        id: 'release-123',
        title: 'The Best Album',
        publishedAt: new Date('2024-01-01'),
        deletedOn: null,
      };

      mockReleaseFindByTitle.mockResolvedValue(existingRelease);

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
      mockReleaseFindByTitle.mockResolvedValue({
        id: 'release-123',
        title: 'Trimmed Album',
        publishedAt: null,
        deletedOn: null,
      });

      const metadata: ReleaseMetadata = {
        album: '  Trimmed Album  ',
      };

      await findOrCreateReleaseAction(metadata);

      expect(mockReleaseFindByTitle).toHaveBeenCalledWith('Trimmed Album');
    });
  });

  describe('creating new release', () => {
    beforeEach(() => {
      mockReleaseFindByTitle.mockResolvedValue(null);
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

    it('should include pre-generated id in creation data when provided', async () => {
      const createdRelease = {
        id: 'pre-gen-id-abc',
        title: 'Album With Id',
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
        album: 'Album With Id',
        id: 'pre-gen-id-abc',
      };

      const result = await findOrCreateReleaseAction(metadata);

      expect(result).toEqual({
        success: true,
        releaseId: 'pre-gen-id-abc',
        releaseTitle: 'Album With Id',
        created: true,
      });

      expect(mockReleaseServiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pre-gen-id-abc',
        })
      );
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
      mockReleaseFindByTitle.mockResolvedValue(null);
    });

    it('should handle release creation failure', async () => {
      mockReleaseServiceCreate.mockResolvedValue({
        success: false,
        error: 'Database error',
        code: 'UNKNOWN',
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
      mockReleaseFindByTitle.mockRejectedValue(new Error('Connection failed'));

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
      mockReleaseFindByTitle.mockRejectedValue('Unknown error type');

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
    it('restores a soft-deleted release when found', async () => {
      mockReleaseFindByTitle.mockResolvedValue({
        id: 'release-deleted',
        title: 'Deleted Album',
        publishedAt: null,
        deletedOn: new Date('2024-06-01'),
      });

      await findOrCreateReleaseAction({ album: 'Deleted Album' });

      expect(mockRestoreFound.mock.calls).toEqual([['release-deleted']]);
    });

    it('leaves a release that is not deleted alone', async () => {
      mockReleaseFindByTitle.mockResolvedValue({
        id: 'release-active',
        title: 'Active Album',
        publishedAt: null,
        deletedOn: null,
      });

      await findOrCreateReleaseAction({ album: 'Active Album' });

      expect(mockRestoreFound.mock.calls).toEqual([]);
    });
  });

  describe('publish option (ADR-0015)', () => {
    const awaiting = {
      id: 'artist-new',
      slug: 'mc-example',
      name: 'MC Example',
      bioState: 'none' as const,
      bioGeneratedAt: null,
      displayImageCount: 0,
    };
    const unpublished = {
      id: 'release-1',
      title: 'Album',
      publishedAt: null,
      deletedOn: null,
    };
    const created = { id: 'release-new', title: 'New Album' };

    beforeEach(() => {
      mockReleaseFindByTitle.mockResolvedValue(unpublished);
      mockReleaseServiceCreate.mockResolvedValue({ success: true, data: created as never });
      mockPublishRelease.mockResolvedValue({ success: true, data: created as never });
      mockForRelease.mockResolvedValue({ success: true, data: { awaiting: [], stayHidden: [] } });
      vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
        success: true,
        data: { id: 'artist-new', displayName: 'MC Example', firstName: 'MC', surname: 'Example' },
      });
    });

    afterEach(() => {
      mockReleaseFindByTitle.mockReset();
      mockReleaseServiceCreate.mockReset();
      mockPublishRelease.mockReset();
      mockForRelease.mockReset();
      vi.mocked(ArtistService.findOrCreateByName).mockReset();
    });

    it('publishes a found release when no credit awaits confirmation', async () => {
      const result = await findOrCreateReleaseAction({ album: 'Album' }, { publish: true });

      expect({ calls: mockPublishRelease.mock.calls, published: result.published }).toEqual({
        calls: [['release-1']],
        published: true,
      });
    });

    it('credits the artist before it decides whether to publish', async () => {
      const order: string[] = [];
      vi.mocked(ArtistService.connectToRelease).mockImplementationOnce(async () => {
        order.push('credit');
      });
      mockForRelease.mockImplementationOnce(async () => {
        order.push('read credits');
        return { success: true, data: { awaiting: [], stayHidden: [] } };
      });

      await findOrCreateReleaseAction(
        { album: 'Album', albumArtist: 'MC Example' },
        { publish: true }
      );

      expect(order).toEqual(['credit', 'read credits']);
    });

    it('leaves a found release unpublished when a credit awaits confirmation', async () => {
      mockForRelease.mockResolvedValueOnce({
        success: true,
        data: { awaiting: [awaiting], stayHidden: [] },
      });

      await findOrCreateReleaseAction(
        { album: 'Album', albumArtist: 'MC Example' },
        { publish: true }
      );

      expect(mockPublishRelease.mock.calls).toEqual([]);
    });

    it('returns the credits awaiting confirmation instead of publishing', async () => {
      const creditConfirmation = { awaiting: [awaiting], stayHidden: [] };
      mockForRelease.mockResolvedValueOnce({ success: true, data: creditConfirmation });

      const result = await findOrCreateReleaseAction(
        { album: 'Album', albumArtist: 'MC Example' },
        { publish: true }
      );

      expect(result).toEqual({
        success: true,
        releaseId: 'release-1',
        releaseTitle: 'Album',
        created: false,
        artistId: 'artist-new',
        published: false,
        creditConfirmation,
      });
    });

    it('creates a release unpublished and publishes it after its credits are stored', async () => {
      mockReleaseFindByTitle.mockResolvedValue(null);

      const result = await findOrCreateReleaseAction({ album: 'New Album' }, { publish: true });

      expect({
        createdWith: mockReleaseServiceCreate.mock.calls[0][0],
        publishCalls: mockPublishRelease.mock.calls,
        published: result.published,
      }).toEqual({
        createdWith: expect.not.objectContaining({ publishedAt: expect.anything() }),
        publishCalls: [['release-new']],
        published: true,
      });
    });

    it('leaves a created release unpublished when a credit awaits confirmation', async () => {
      mockReleaseFindByTitle.mockResolvedValue(null);
      mockForRelease.mockResolvedValueOnce({
        success: true,
        data: { awaiting: [awaiting], stayHidden: [] },
      });

      const result = await findOrCreateReleaseAction(
        { album: 'New Album', albumArtist: 'MC Example' },
        { publish: true }
      );

      expect({ calls: mockPublishRelease.mock.calls, published: result.published }).toEqual({
        calls: [],
        published: false,
      });
    });

    it('does not publish without the publish option', async () => {
      await findOrCreateReleaseAction({ album: 'Album' });

      expect(mockPublishRelease.mock.calls).toEqual([]);
    });

    it('reports credits awaiting confirmation on a release that is already published', async () => {
      const creditConfirmation = { awaiting: [awaiting], stayHidden: [] };
      mockReleaseFindByTitle.mockResolvedValue({
        ...unpublished,
        publishedAt: new Date('2024-01-01'),
      });
      mockForRelease.mockResolvedValueOnce({ success: true, data: creditConfirmation });

      const result = await findOrCreateReleaseAction({
        album: 'Album',
        albumArtist: 'MC Example',
      });

      expect(result).toMatchObject({ published: true, creditConfirmation });
    });

    it('fails when the release cannot be published', async () => {
      mockPublishRelease.mockResolvedValueOnce({
        success: false,
        code: 'NOT_FOUND',
        error: 'Release not found',
      });

      const result = await findOrCreateReleaseAction({ album: 'Album' }, { publish: true });

      expect(result).toEqual({ success: false, error: 'Release not found' });
    });

    it('fails when the credits cannot be read', async () => {
      mockForRelease.mockResolvedValueOnce({
        success: false,
        code: 'UNAVAILABLE',
        error: 'Database unavailable',
      });

      const result = await findOrCreateReleaseAction({ album: 'Album' }, { publish: true });

      expect(result).toEqual({ success: false, error: 'Database unavailable' });
    });
  });

  describe('create failures', () => {
    it('should return error with specific message when createRelease returns failure with error', async () => {
      mockReleaseFindByTitle.mockResolvedValue(null);
      mockReleaseServiceCreate.mockResolvedValue({
        success: false,
        error: 'Title cannot be empty',
      } as never);

      const result = await findOrCreateReleaseAction({ album: 'New Album' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Title cannot be empty');
    });

    it('should return fallback error message when createRelease returns failure with empty error', async () => {
      mockReleaseFindByTitle.mockResolvedValue(null);
      mockReleaseServiceCreate.mockResolvedValue({
        success: false,
        error: '',
      } as never);

      const result = await findOrCreateReleaseAction({ album: 'New Album' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create release');
    });

    it('should return fallback error message when createRelease returns failure with undefined error', async () => {
      mockReleaseFindByTitle.mockResolvedValue(null);
      mockReleaseServiceCreate.mockResolvedValue({
        success: false,
      } as never);

      const result = await findOrCreateReleaseAction({ album: 'New Album' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create release');
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
      mockReleaseFindByTitle.mockResolvedValue(null);
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
        code: 'INVALID_INPUT',
      });

      const result = await findOrCreateReleaseAction({
        album: 'New Album',
        albumArtist: 'Ceschi',
      });

      expect(result.success).toBe(true);
      expect(result.artistId).toBeUndefined();
    });

    it('should connect artist when finding an existing release', async () => {
      mockReleaseFindByTitle.mockResolvedValue({
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
