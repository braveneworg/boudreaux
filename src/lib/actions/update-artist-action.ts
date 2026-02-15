'use server';

import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';

import { ArtistService } from '../services/artist-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { createArtistSchema } from '../validation/create-artist-schema';

import type { FormState } from '../types/form-state';

export const updateArtistAction = async (
  artistId: string,
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');
  if (!session?.user?.id) {
    throw new Error('Invalid admin session: missing user id for audit logging.');
  }

  const permittedFieldNames = [
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
  ];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createArtistSchema);

  if (!parsed.success) {
    // Schema validation failed - add validation errors to formState
    formState.success = false;
    if (!formState.errors) {
      formState.errors = {};
    }
    // Add Zod validation errors
    for (const error of parsed.error.issues) {
      const field = error.path[0]?.toString() || 'general';
      if (!formState.errors[field]) {
        formState.errors[field] = [];
      }
      formState.errors[field].push(error.message);
    }
    return formState;
  }

  try {
    const {
      firstName,
      surname,
      slug,
      middleName,
      displayName,
      title,
      suffix,
      akaNames,
      bio,
      shortBio,
      altBio,
      genres,
      tags,
      bornOn,
      diedOn,
      publishedOn,
    } = parsed.data;

    // Update artist in database
    const response = await ArtistService.updateArtist(artistId, {
      firstName,
      surname,
      slug,
      middleName: middleName || undefined,
      displayName: displayName || undefined,
      title: title || undefined,
      suffix: suffix || undefined,
      akaNames: akaNames || undefined,
      bio: bio || undefined,
      shortBio: shortBio || undefined,
      altBio: altBio || undefined,
      genres: genres || undefined,
      tags: tags || undefined,
      bornOn: bornOn ? new Date(bornOn) : undefined,
      diedOn: diedOn ? new Date(diedOn) : undefined,
      publishedOn: publishedOn ? new Date(publishedOn) : undefined,
    });

    // Log artist update for security audit
    logSecurityEvent({
      event: 'media.artist.updated',
      userId: session.user.id,
      metadata: {
        artistId,
        updatedFields: Object.keys(parsed.data).filter(
          (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
        ),
        success: response.success,
      },
    });

    if (response.success) {
      formState.errors = undefined;
      formState.data = { artistId: response.data?.id };
    } else {
      if (!formState.errors) {
        formState.errors = {};
      }

      const errorMessage = response.error || 'Failed to update artist';

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

    // Revalidate the artist pages
    revalidatePath('/admin/artists');
    revalidatePath(`/artists/${slug}`);
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
