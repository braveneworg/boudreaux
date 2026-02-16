/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';

import { updateArtistAction } from './update-artist-action';
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

describe('updateArtistAction', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  const mockArtistId = 'artist-123';

  const mockFormData = new FormData();
  mockFormData.append('firstName', 'John');
  mockFormData.append('surname', 'Doe');
  mockFormData.append('slug', 'john-doe');
  mockFormData.append('middleName', 'M');
  mockFormData.append('displayName', 'Johnny Doe');
  mockFormData.append('bio', 'A talented artist');

  const initialFormState: FormState = {
    fields: {},
    success: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('Authorization', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(
        updateArtistAction(mockArtistId, initialFormState, mockFormData)
      ).rejects.toThrow('Unauthorized');

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should throw when session user id is missing', async () => {
      vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);

      await expect(
        updateArtistAction(mockArtistId, initialFormState, mockFormData)
      ).rejects.toThrow('Invalid admin session: missing user id for audit logging.');
    });
  });

  describe('Validation', () => {
    it('should validate form data with all permitted fields', async () => {
      const mockGetActionState = vi.mocked(getActionState);
      mockGetActionState.mockReturnValue({
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(getActionState).toHaveBeenCalledWith(
        mockFormData,
        [
          'firstName',
          'surname',
          'slug',
          'displayName',
          'middleName',
          'title',
          'suffix',
          'akaNames',
          'bio',
          'shortBio',
          'altBio',
          'genres',
          'tags',
          'bornOn',
          'diedOn',
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
              { path: ['firstName'], message: 'First name is required' },
              { path: ['surname'], message: 'Last name is required' },
            ],
          },
        },
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.firstName).toEqual(['First name is required']);
      expect(result.errors?.surname).toEqual(['Last name is required']);
      expect(ArtistService.updateArtist).not.toHaveBeenCalled();
    });

    it('should handle validation errors with empty path', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: {
            issues: [{ path: [], message: 'General validation error' }],
          },
        },
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['General validation error']);
    });

    it('should accumulate multiple errors for the same field', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: {
            issues: [
              { path: ['firstName'], message: 'First name is required' },
              { path: ['firstName'], message: 'First name must be at least 2 characters' },
            ],
          },
        },
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.firstName).toEqual([
        'First name is required',
        'First name must be at least 2 characters',
      ]);
    });
  });

  describe('Artist Update', () => {
    it('should update artist successfully with all fields', async () => {
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
            title: 'Dr.',
            suffix: 'Jr.',
            akaNames: 'JD',
            bio: 'A talented artist',
            shortBio: 'Talented artist',
            altBio: 'Alternative bio',
            genres: 'Jazz, Blues',
            tags: 'saxophone, piano',
            bornOn: '1990-01-15',
            diedOn: '2020-12-31',
            publishedOn: '2015-06-01',
          },
        },
      } as never);

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(ArtistService.updateArtist).toHaveBeenCalledWith(mockArtistId, {
        firstName: 'John',
        surname: 'Doe',
        slug: 'john-doe',
        middleName: 'M',
        displayName: 'Johnny Doe',
        title: 'Dr.',
        suffix: 'Jr.',
        akaNames: 'JD',
        bio: 'A talented artist',
        shortBio: 'Talented artist',
        altBio: 'Alternative bio',
        genres: 'Jazz, Blues',
        tags: 'saxophone, piano',
        bornOn: expect.any(Date),
        diedOn: expect.any(Date),
        publishedOn: expect.any(Date),
      });

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ artistId: 'artist-123' });
    });

    it('should update artist with minimal required fields', async () => {
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(ArtistService.updateArtist).toHaveBeenCalledWith(mockArtistId, {
        firstName: 'John',
        surname: 'Doe',
        slug: 'john-doe',
        middleName: undefined,
        displayName: undefined,
        title: undefined,
        suffix: undefined,
        akaNames: undefined,
        bio: undefined,
        shortBio: undefined,
        altBio: undefined,
        genres: undefined,
        tags: undefined,
        bornOn: undefined,
        diedOn: undefined,
        publishedOn: undefined,
      });

      expect(result.success).toBe(true);
    });

    it('should handle artist update failure from service', async () => {
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Artist with this slug already exists',
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.slug).toEqual([
        'This slug is already in use. Please choose a different one.',
      ]);
    });

    it('should handle slug unique constraint error', async () => {
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Duplicate slug detected',
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.slug).toEqual([
        'This slug is already in use. Please choose a different one.',
      ]);
    });

    it('should handle service returning generic error', async () => {
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Database connection failed']);
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to update artist']);
    });

    it('should handle exception during update', async () => {
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

      vi.mocked(ArtistService.updateArtist).mockRejectedValue(new Error('Network error'));

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(setUnknownError).toHaveBeenCalledWith(result);
    });
  });

  describe('Security Logging', () => {
    it('should log successful artist update', async () => {
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.artist.updated',
        userId: 'user-123',
        metadata: {
          artistId: mockArtistId,
          updatedFields: ['firstName', 'surname', 'slug', 'middleName', 'displayName'],
          success: true,
        },
      });
    });

    it('should log failed artist update attempt', async () => {
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.artist.updated',
        userId: 'user-123',
        metadata: {
          artistId: mockArtistId,
          updatedFields: ['firstName', 'surname', 'slug'],
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.artist.updated',
        userId: 'user-123',
        metadata: {
          artistId: mockArtistId,
          updatedFields: ['firstName', 'surname', 'slug'],
          success: true,
        },
      });
    });
  });

  describe('Cache Revalidation', () => {
    it('should revalidate artists page and individual artist page on success', async () => {
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: { id: 'artist-123' },
      } as never);

      await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
      expect(revalidatePath).toHaveBeenCalledWith('/artists/john-doe');
    });

    it('should revalidate paths even on failure', async () => {
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

      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
      expect(revalidatePath).toHaveBeenCalledWith('/artists/john-doe');
    });
  });

  describe('FormState handling', () => {
    it('should preserve existing errors object structure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: {
          success: false,
          error: {
            issues: [{ path: ['firstName'], message: 'First name is required' }],
          },
        },
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.errors?.firstName).toEqual(['First name is required']);
    });

    it('should initialize errors object when not present in formState', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: {
            issues: [{ path: ['firstName'], message: 'First name is required' }],
          },
        },
      } as never);

      const result = await updateArtistAction(mockArtistId, initialFormState, mockFormData);

      expect(result.errors).toBeDefined();
      expect(result.errors?.firstName).toEqual(['First name is required']);
    });
  });
});
