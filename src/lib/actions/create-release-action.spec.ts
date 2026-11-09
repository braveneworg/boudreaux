/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { CreditConfirmationService } from '@/lib/services/credit-confirmation-service';
import { ReleaseService } from '@/lib/services/release-service';
import { readActionInput } from '@/lib/utils/forms/read-action-input';
import type { ReleaseActionInput } from '@/lib/validation/create-release-schema';
import { logSecurityEvent } from '@/utils/audit-log';
import { setUnknownError } from '@/utils/auth/auth-utils';

import { createReleaseAction } from './create-release-action';

vi.mock('server-only', () => ({}));

// Mock all dependencies
vi.mock('next/cache');

vi.mock('../services/release-service');
vi.mock('../services/credit-confirmation-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('@/lib/utils/forms/read-action-input', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readActionInput: vi.fn(),
}));
vi.mock('@/lib/auth/action-gate');

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

describe('createReleaseAction', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  const mockInput = {
    title: 'Test Album',
    releasedOn: '2024-01-15',
    coverArt: 'https://example.com/cover.jpg',
    formats: ['DIGITAL'],
    labels: 'Test Label',
    catalogNumber: 'CAT-001',
    description: 'A test album',
  };

  beforeEach(() => {
    vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('Credit confirmation (ADR-0015)', () => {
    const artistA = '507f1f77bcf86cd799439012';
    const artistB = '507f1f77bcf86cd799439013';
    const decisions = { publishArtistIds: [artistA], keepHiddenArtistIds: [artistB] };
    const undecided = {
      success: false as const,
      code: 'VALIDATION' as const,
      error: 'Choose to publish or keep hidden: Bea',
    };

    /** An input carrying `creditDecisions`; `readActionInput` is mocked, so only they are read. */
    const inputWith = (creditDecisions?: unknown): ReleaseActionInput =>
      (creditDecisions === undefined ? {} : { creditDecisions }) as ReleaseActionInput;

    const parsedWith = (data: Record<string, unknown>): void => {
      vi.mocked(readActionInput).mockReturnValueOnce({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            ...data,
          },
        },
      } as never);
    };

    beforeEach(() => {
      vi.mocked(CreditConfirmationService.check).mockResolvedValue({
        success: true,
        data: undefined,
      });
      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-new' },
      } as never);
      vi.mocked(ReleaseService.publishRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-new' },
      } as never);
    });

    afterEach(() => {
      vi.mocked(CreditConfirmationService.check).mockReset();
      vi.mocked(ReleaseService.createRelease).mockReset();
      vi.mocked(ReleaseService.publishRelease).mockReset();
    });

    it('checks the decisions against the artists the form credits before it writes', async () => {
      parsedWith({ publishedAt: '2026-09-27T12:00:00.000Z', artistIds: [artistA, artistB] });

      await createReleaseAction(inputWith(decisions));

      expect(vi.mocked(CreditConfirmationService.check).mock.calls).toEqual([
        [[artistA, artistB], decisions],
      ]);
    });

    it('creates nothing and names the artists when a credit is undecided', async () => {
      vi.mocked(CreditConfirmationService.check).mockResolvedValueOnce(undecided);
      parsedWith({ publishedAt: '2026-09-27T12:00:00.000Z', artistIds: [artistA, artistB] });

      const result = await createReleaseAction(inputWith());

      expect({
        success: result.success,
        errors: result.errors,
        created: vi.mocked(ReleaseService.createRelease).mock.calls,
      }).toEqual({
        success: false,
        errors: { general: ['Choose to publish or keep hidden: Bea'] },
        created: [],
      });
    });

    it('creates the release with its credits, then publishes it', async () => {
      const order: string[] = [];
      vi.mocked(ReleaseService.createRelease).mockImplementationOnce(async (_data, artistIds) => {
        order.push(`create with ${artistIds?.length ?? 0} credits`);
        return { success: true, data: { id: 'release-new' } } as never;
      });
      vi.mocked(ReleaseService.publishRelease).mockImplementationOnce(async () => {
        order.push('publish');
        return { success: true, data: { id: 'release-new' } } as never;
      });
      parsedWith({ publishedAt: '2026-09-27T12:00:00.000Z', artistIds: [artistA, artistB] });

      await createReleaseAction(inputWith(decisions));

      expect(order).toEqual(['create with 2 credits', 'publish']);
    });

    it("publishes with the admin's decisions and id", async () => {
      parsedWith({ publishedAt: '2026-09-27T12:00:00.000Z', artistIds: [artistA, artistB] });

      await createReleaseAction(inputWith(decisions));

      expect(vi.mocked(ReleaseService.publishRelease).mock.calls).toEqual([
        ['release-new', { decisions, publishedBy: 'user-123' }],
      ]);
    });

    it('skips the check and the publish for a release saved unpublished', async () => {
      parsedWith({ artistIds: [artistA] });

      await createReleaseAction(inputWith());

      expect({
        checks: vi.mocked(CreditConfirmationService.check).mock.calls,
        publishes: vi.mocked(ReleaseService.publishRelease).mock.calls,
      }).toEqual({ checks: [], publishes: [] });
    });

    it('rejects malformed decisions before it writes', async () => {
      parsedWith({ publishedAt: '2026-09-27T12:00:00.000Z' });

      const result = await createReleaseAction(inputWith('not json'));

      expect({
        success: result.success,
        errors: result.errors,
        created: vi.mocked(ReleaseService.createRelease).mock.calls,
      }).toEqual({
        success: false,
        errors: { general: ['Invalid artist decisions'] },
        created: [],
      });
    });

    it('keeps the created release and reports a failed publish', async () => {
      vi.mocked(ReleaseService.publishRelease).mockResolvedValueOnce(undecided);
      parsedWith({ publishedAt: '2026-09-27T12:00:00.000Z', artistIds: [artistA, artistB] });

      const result = await createReleaseAction(inputWith(decisions));

      expect({ success: result.success, errors: result.errors, data: result.data }).toEqual({
        success: false,
        errors: { general: ['Choose to publish or keep hidden: Bea'] },
        data: { releaseId: 'release-new' },
      });
    });
  });

  describe('Authorization', () => {
    it('resolves (not rejects) the gate refusal as a form error without creating a release', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      await expect(createReleaseAction(mockInput)).resolves.toEqual({
        fields: {},
        success: false,
        errors: { general: ['Unauthorized'] },
      });
      expect(ReleaseService.createRelease).not.toHaveBeenCalled();
    });

    it('should allow admin users to create releases', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      const result = await createReleaseAction(mockInput);

      expect(result.success).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should validate form data with permitted fields only', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

      expect(readActionInput).toHaveBeenCalledWith(
        mockInput,
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
        expect.anything(),
        { blankStrings: 'omit' }
      );
    });

    it('should return validation errors when data is invalid', async () => {
      const mockFormState = {
        fields: {},
        success: false,
        errors: { title: ['Title is required'] },
      };

      vi.mocked(readActionInput).mockReturnValue({
        formState: mockFormState,
        parsed: { success: false, error: {} },
      } as never);

      const result = await createReleaseAction(mockInput);

      expect(result).toEqual(mockFormState);
      expect(ReleaseService.createRelease).not.toHaveBeenCalled();
    });
  });

  describe('Release Creation', () => {
    it('should create release successfully with all fields', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      const result = await createReleaseAction(mockInput);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        {
          title: 'Test Album',
          releasedOn: expect.any(Date),
          coverArt: 'https://example.com/cover.jpg',
          formats: ['DIGITAL', 'VINYL'],
          labels: ['Label 1', 'Label 2'],
          catalogNumber: 'CAT-001',
          description: 'A test album',
        },
        []
      );

      expect(result.success).toBe(true);
      expect(result.data?.releaseId).toBe('release-123');
      expect(result.errors).toBeUndefined();
    });

    it('should create release with minimal required fields', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      const result = await createReleaseAction(mockInput);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        {
          title: 'Test Album',
          releasedOn: expect.any(Date),
          coverArt: 'https://example.com/cover.jpg',
          formats: ['DIGITAL'],
          labels: [],
          catalogNumber: undefined,
          description: undefined,
        },
        []
      );

      expect(result.success).toBe(true);
    });

    it('should parse comma-separated labels into array', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['Label 1', 'Label 2', 'Label 3'],
        }),
        expect.any(Array)
      );
    });

    it('should handle empty labels string', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: [],
        }),
        expect.any(Array)
      );
    });

    it('marks the title field for a DUPLICATE whatever the copy says', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      vi.mocked(ReleaseService.createRelease).mockResolvedValueOnce({
        success: false,
        error: 'Some reworded copy',
        code: 'DUPLICATE',
      });

      const result = await createReleaseAction(mockInput);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual({
        title: ['This title is already in use. Please choose a different one.'],
      });
    });

    it('should handle service returning generic error', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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
        code: 'UNAVAILABLE',
      });

      const result = await createReleaseAction(mockInput);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to create release']);
    });

    it('should preserve existing errors object when service fails', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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
        code: 'UNAVAILABLE',
      });

      const result = await createReleaseAction(mockInput);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to create release']);
    });

    it('should use default format when formats is undefined', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          formats: ['DIGITAL'],
        }),
        expect.any(Array)
      );
    });
  });

  describe('Security Logging', () => {
    it('should log successful release creation', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

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
      vi.mocked(readActionInput).mockReturnValue({
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
        code: 'UNKNOWN',
      });

      await createReleaseAction(mockInput);

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
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

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
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/releases/new');
    });

    it('should revalidate public surfaces on success', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

      expect(revalidatePath).toHaveBeenCalledWith('/releases');
      expect(revalidatePath).toHaveBeenCalledWith('/artists/[slug]', 'page');
    });

    it('should not revalidate public surfaces on failure', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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
        code: 'UNKNOWN',
      });

      await createReleaseAction(mockInput);

      expect(revalidatePath).not.toHaveBeenCalledWith('/releases');
    });

    it('should revalidate release creation page on failure', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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
        code: 'UNKNOWN',
      });

      await createReleaseAction(mockInput);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/releases/new');
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

      expect(setUnknownError).toHaveBeenCalled();
    });

    it('keeps a non-DUPLICATE failure off the title field even when its copy names the title', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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
      vi.mocked(ReleaseService.createRelease).mockResolvedValueOnce({
        success: false,
        error: 'Release with this title already exists',
        code: 'UNKNOWN',
      });

      const result = await createReleaseAction(mockInput);

      expect(result.errors).toEqual({ general: ['Failed to create release'] });
    });
  });

  describe('Artist Associations', () => {
    const parsedWithArtists = (artistIds?: string[]) =>
      ({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Test Album',
            releasedOn: '2024-01-15',
            coverArt: 'https://example.com/cover.jpg',
            formats: ['DIGITAL'],
            ...(artistIds ? { artistIds } : {}),
          },
        },
      }) as never;

    beforeEach(() => {
      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: { id: 'release-123' },
      } as never);
    });

    it('hands the service the artist ids to store with the release, in order', async () => {
      vi.mocked(readActionInput).mockReturnValue(parsedWithArtists(['artist-2', 'artist-1']));

      await createReleaseAction(mockInput);

      expect(vi.mocked(ReleaseService.createRelease).mock.calls[0][1]).toEqual([
        'artist-2',
        'artist-1',
      ]);
    });

    it('hands the service no artist ids when the form names none', async () => {
      vi.mocked(readActionInput).mockReturnValue(parsedWithArtists());

      await createReleaseAction(mockInput);

      expect(vi.mocked(ReleaseService.createRelease).mock.calls[0][1]).toEqual([]);
    });
  });

  describe('preGeneratedId', () => {
    it('should pass preGeneratedId to createRelease when a valid ObjectId is provided', async () => {
      const validObjectId = '507f1f77bcf86cd799439011';
      const formDataWithId = {
        title: 'Test Album',
        releasedOn: '2024-01-15',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL'],
        preGeneratedId: validObjectId,
      };

      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(formDataWithId);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({ id: validObjectId }),
        expect.any(Array)
      );
    });

    it('should not pass preGeneratedId when an invalid ObjectId is provided', async () => {
      const formDataWithBadId = {
        title: 'Test Album',
        releasedOn: '2024-01-15',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL'],
        preGeneratedId: 'not-a-valid-id',
      };

      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(formDataWithBadId);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.not.objectContaining({ id: expect.anything() }),
        expect.any(Array)
      );
    });
  });

  describe('suggestedPrice', () => {
    it('should convert suggestedPrice from dollars to cents', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedPrice: 999 }),
        expect.any(Array)
      );
    });

    it('should not include suggestedPriceCents when suggestedPrice is empty', async () => {
      vi.mocked(readActionInput).mockReturnValue({
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

      await createReleaseAction(mockInput);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedPrice: undefined }),
        expect.any(Array)
      );
    });
  });
});
