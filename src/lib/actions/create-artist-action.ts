'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { ArtistService } from '../services/artist-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import getActionState from '../utils/auth/get-action-state';
import { createArtistSchema } from '../validation/create-artist-schema';

import type { FormState } from '../types/form-state';

export const createArtistAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  await requireRole('admin');

  const permittedFieldNames = [
    'firstName',
    'surname',
    'slug',
    'displayName',
    'middleName',
    'publishedOn',
  ];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createArtistSchema);

  if (parsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id && session?.user?.role !== 'admin') {
        formState.success = false;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = ['You must be a logged in admin user to create an artist'];
        return formState;
      }

      const { firstName, surname, slug, middleName, displayName } = parsed.data;

      // Create artist in database
      const response = await ArtistService.createArtist({
        firstName,
        surname,
        slug,
        middleName,
        displayName,
      });

      // Log artist creation for security audit
      logSecurityEvent({
        event: 'media.artist.created',
        userId: session.user.id,
        metadata: {
          createdFields: Object.keys(parsed.data).filter(
            (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
          ),
          success: response.success,
        },
      });

      if (response.success) {
        formState.errors = undefined;
      } else {
        if (!formState.errors) {
          formState.errors = {};
        }

        const errorMessage = response.error || 'Failed to create artist';

        // Check if error is related to slug uniqueness
        if (
          errorMessage.toLowerCase().includes('slug') &&
          (errorMessage.toLowerCase().includes('unique') ||
            errorMessage.toLowerCase().includes('already exists') ||
            errorMessage.toLowerCase().includes('duplicate'))
        ) {
          formState.errors.slug = ['This slug is already in use. Please choose a different one.'];
        } else {
          formState.errors = { general: [errorMessage] };
        }
      }

      formState.success = response.success;

      // Revalidate the create artist page to clear data
      revalidatePath('/admin/artist/new');
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
