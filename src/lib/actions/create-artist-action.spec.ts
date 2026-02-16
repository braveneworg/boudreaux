/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';

import { createArtistAction } from './create-artist-action';
import { auth } from '../../../auth';
import { ArtistService } from '../services/artist-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { requireRole } from '../utils/auth/require-role';

import type { FormState } from '../types/form-state';

vi.mock('server-only', () => ({}));

// Mock all dependencies
vi.mock('next/cache');
vi.mock('../../../auth');
vi.mock('../services/artist-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('@/lib/utils/auth/get-action-state');
vi.mock('../utils/auth/require-role');

describe('createArtistAction', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  const mockFormData = new FormData();
  mockFormData.append('firstName', 'John');
  mockFormData.append('surname', 'Doe');
  mockFormData.append('slug', 'john-doe');
  mockFormData.append('middleName', 'M');
  mockFormData.append('displayName', 'Johnny Doe');

  const initialFormState: FormState = {
    fields: {},
    success: false,
  };

  beforeEach(() => {
    // Reset all mocks to clear implementations from previous tests (not just call history)
    vi.resetAllMocks();

    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});

    // Default mock for getActionState - required for tests that depend on parsing
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false },
      parsed: {
        success: true,
        data: {
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
          middleName: 'M',
          displayName: 'Johnny Doe',
        },
      },
    } as never);

    // Default mock for ArtistService.createArtist - required for successful flow tests
    vi.mocked(ArtistService.createArtist).mockResolvedValue({
      success: true,
      data: { id: 'artist-123' },
    } as never);
  });

  describe('Authorization', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(createArtistAction(initialFormState, mockFormData)).rejects.toThrow(
        'Unauthorized'
      );

      expect(requireRole).toHaveBeenCalledWith('admin');
    });
  });

  describe('Validation', () => {
    it('should validate form data with permitted fields only', async () => {
      const mockGetActionState = vi.mocked(getActionState);
      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
            middleName: 'M',
            displayName: 'Johnny Doe',
          },
        },
      } as never);

      await createArtistAction(initialFormState, mockFormData);

      expect(getActionState).toHaveBeenCalledWith(
        mockFormData,
        ['firstName', 'surname', 'slug', 'displayName', 'middleName', 'publishedOn'],
        expect.anything()
      );
    });

    it('should return validation errors when data is invalid', async () => {
      const mockFormState = {
        fields: {},
        success: false,
        errors: { firstName: ['First name is required'] },
      };

      vi.mocked(getActionState).mockReturnValue({
        formState: mockFormState,
        parsed: { success: false, error: {} },
      } as never);

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(ArtistService.createArtist).not.toHaveBeenCalled();
    });
  });

  describe('Artist Creation', () => {
    it('should create artist successfully with all fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
            middleName: 'M',
            displayName: 'Johnny Doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(ArtistService.createArtist).toHaveBeenCalledWith({
        firstName: 'John',
        surname: 'Doe',
        slug: 'john-doe',
        middleName: 'M',
        displayName: 'Johnny Doe',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should create artist with minimal required fields', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(ArtistService.createArtist).toHaveBeenCalledWith({
        firstName: 'John',
        surname: 'Doe',
        slug: 'john-doe',
      });

      expect(result.success).toBe(true);
    });

    it('should handle artist creation failure from service', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Artist with this slug already exists',
      } as never);

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.slug).toEqual([
        'This slug is already in use. Please choose a different one.',
      ]);
    });

    it('should handle service returning error without message', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
      } as never);

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to create artist']);
    });
  });

  describe('Security Logging', () => {
    it('should log successful artist creation', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
            middleName: 'M',
            displayName: 'Johnny Doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      await createArtistAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.artist.created',
        userId: 'user-123',
        metadata: {
          createdFields: ['firstName', 'surname', 'slug', 'middleName', 'displayName'],
          success: true,
        },
      });
    });

    it('should log failed artist creation attempt', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await createArtistAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.artist.created',
        userId: 'user-123',
        metadata: {
          createdFields: ['firstName', 'surname', 'slug'],
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
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
            middleName: undefined,
            displayName: undefined,
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      await createArtistAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.artist.created',
        userId: 'user-123',
        metadata: {
          createdFields: ['firstName', 'surname', 'slug'],
          success: true,
        },
      });
    });
  });

  describe('Cache Revalidation', () => {
    it('should revalidate artist creation page on success', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      await createArtistAction(initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/artist/new');
    });

    it('should revalidate even on failure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Error',
      } as never);

      await createArtistAction(initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/artist/new');
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors during artist creation', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockRejectedValue(Error('Unexpected database error'));

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(setUnknownError).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('should handle errors during security logging', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      vi.mocked(logSecurityEvent).mockImplementation(() => {
        throw Error('Logging failed');
      });

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(setUnknownError).toHaveBeenCalled();
    });
  });

  describe('slug uniqueness error handling', () => {
    it('should handle slug error with "unique" keyword', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'Jane',
            surname: 'Doe',
            slug: 'existing-slug',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Slug must be unique',
      } as never);

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.slug).toEqual([
        'This slug is already in use. Please choose a different one.',
      ]);
    });

    it('should handle slug error with "already exists" keyword', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'Jane',
            surname: 'Doe',
            slug: 'existing-slug',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Slug already exists in the database',
      } as never);

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.slug).toEqual([
        'This slug is already in use. Please choose a different one.',
      ]);
    });

    it('should handle slug error with "duplicate" keyword', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            firstName: 'Jane',
            surname: 'Doe',
            slug: 'existing-slug',
          },
        },
      } as never);

      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Duplicate slug detected',
      } as never);

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.slug).toEqual([
        'This slug is already in use. Please choose a different one.',
      ]);
    });
  });
});
