'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { FeaturedArtistsService } from '../services/featured-artists-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import getActionState from '../utils/auth/get-action-state';
import { createFeaturedArtistSchema } from '../validation/create-featured-artist-schema';

import type { FormState } from '../types/form-state';

export const createFeaturedArtistAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  await requireRole('admin');

  // Parse artistIds as array from form data
  const artistIds = payload.getAll('artistIds') as string[];
  payload.delete('artistIds');

  // Create a new FormData with artistIds as JSON string for validation
  const payloadWithArtistIds = new FormData();
  for (const [key, value] of payload.entries()) {
    payloadWithArtistIds.append(key, value);
  }

  const permittedFieldNames = [
    'displayName',
    'description',
    'coverArt',
    'position',
    'featuredOn',
    'trackId',
    'releaseId',
    'groupId',
  ];

  // Get form state without artistIds first
  const { formState, parsed: baseParsed } = getActionState(
    payloadWithArtistIds,
    permittedFieldNames,
    createFeaturedArtistSchema.omit({ artistIds: true })
  );

  // Validate artistIds separately
  const artistIdsValidation = createFeaturedArtistSchema.shape.artistIds.safeParse(artistIds);

  if (!artistIdsValidation.success) {
    formState.success = false;
    if (!formState.errors) {
      formState.errors = {};
    }
    formState.errors.artistIds = artistIdsValidation.error.issues.map((e) => e.message);
    return formState;
  }

  if (baseParsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id || session?.user?.role !== 'admin') {
        formState.success = false;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = [
          'You must be a logged in admin user to create a featured artist',
        ];
        return formState;
      }

      const {
        displayName,
        description,
        coverArt,
        position,
        featuredOn,
        trackId,
        releaseId,
        groupId,
      } = baseParsed.data;

      // Build Prisma create input
      const createData = {
        displayName: displayName || undefined,
        description: description || undefined,
        coverArt: coverArt || undefined,
        position: position ?? 0,
        featuredOn: featuredOn ? new Date(featuredOn) : new Date(),
        artists: {
          connect: artistIds.map((id) => ({ id })),
        },
        ...(trackId && { track: { connect: { id: trackId } } }),
        ...(releaseId && { release: { connect: { id: releaseId } } }),
        ...(groupId && { group: { connect: { id: groupId } } }),
      };

      // Create featured artist in database
      const response = await FeaturedArtistsService.createFeaturedArtist(createData);

      // Log featured artist creation for security audit
      logSecurityEvent({
        event: 'media.featured_artist.created',
        userId: session.user.id,
        metadata: {
          createdFields: Object.keys(baseParsed.data).filter(
            (key) => baseParsed.data[key as keyof typeof baseParsed.data] !== undefined
          ),
          artistCount: artistIds.length,
          success: response.success,
        },
      });

      if (response.success) {
        formState.errors = undefined;
        formState.data = { featuredArtistId: response.data?.id };
      } else {
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors = { general: [response.error || 'Failed to create featured artist'] };
      }

      formState.success = response.success;

      // Revalidate the create page and featured artists list
      revalidatePath('/admin/featured-artists/new');
      revalidatePath('/admin');
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
