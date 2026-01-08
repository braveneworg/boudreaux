import { revalidatePath } from 'next/cache';

import { createArtistAction } from './create-artist-action';
import { auth } from '../../../auth';
import { ArtistService } from '../services/artist-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import getActionState from '../utils/auth/get-action-state';
import { requireRole } from '../utils/auth/require-role';

import type { FormState } from '../types/form-state';

vi.mock('next/cache');
vi.mock('../../../auth');
vi.mock('../services/artist-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('../utils/auth/get-action-state');
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
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('Authorization', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      await expect(createArtistAction(initialFormState, mockFormData)).rejects.toThrow(
        'Unauthorized'
      );

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not logged in', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);
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

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'You must be a logged in admin user to create an artist',
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
            firstName: 'John',
            surname: 'Doe',
            slug: 'john-doe',
            middleName: 'M',
            displayName: 'Johnny Doe',
          },
        },
      } as never);

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'You must be a logged in admin user to create an artist',
      ]);
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
        ['firstName', 'surname', 'slug', 'displayName', 'middleName'],
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
      expect(result.errors?.general).toEqual(['Artist with this slug already exists']);
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
      expect(result.errors?.general).toEqual(['']);
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

      vi.mocked(ArtistService.createArtist).mockRejectedValue(
        new Error('Unexpected database error')
      );

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
        throw new Error('Logging failed');
      });

      const result = await createArtistAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(setUnknownError).toHaveBeenCalled();
    });
  });
});
