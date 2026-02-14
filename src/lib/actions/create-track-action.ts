'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { TrackService } from '../services/track-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import getActionState from '../utils/auth/get-action-state';
import { createTrackSchema } from '../validation/create-track-schema';

import type { FormState } from '../types/form-state';

export const createTrackAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  await requireRole('admin');

  const permittedFieldNames = [
    'title',
    'duration',
    'audioUrl',
    'coverArt',
    'position',
    'artistIds',
    'releaseIds',
    'publishedOn',
  ];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createTrackSchema);

  if (parsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id || session?.user?.role !== 'admin') {
        formState.success = false;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = ['You must be a logged in admin user to create a track'];
        return formState;
      }

      const { title, duration, audioUrl, coverArt, position, artistIds, releaseIds } = parsed.data;

      // Create track in database
      const response = await TrackService.createTrack({
        title,
        duration,
        audioUrl,
        coverArt: coverArt || undefined,
        position: position ?? 0,
      });

      // Create TrackArtist associations if track was created and artistIds provided
      if (response.success && response.data?.id && artistIds && artistIds.length > 0) {
        const createdTrackId = response.data.id;
        await prisma.trackArtist.createMany({
          data: artistIds.map((artistId) => ({ artistId, trackId: createdTrackId })),
        });
      }

      // Create ReleaseTrack associations if track was created and releaseIds provided
      if (response.success && response.data?.id && releaseIds && releaseIds.length > 0) {
        const createdTrackId = response.data.id;
        await prisma.releaseTrack.createMany({
          data: releaseIds.map((releaseId) => ({
            releaseId,
            trackId: createdTrackId,
            position: position ?? 0,
          })),
        });
      }

      // Log track creation for security audit
      logSecurityEvent({
        event: 'media.track.created',
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
        // Include the created track ID in the response for image uploads
        formState.data = { trackId: response.data?.id };
      } else {
        if (!formState.errors) {
          formState.errors = {};
        }

        const errorMessage = response.error || 'Failed to create track';

        // Check if error is related to title uniqueness
        if (
          errorMessage.toLowerCase().includes('title') &&
          (errorMessage.toLowerCase().includes('unique') ||
            errorMessage.toLowerCase().includes('already exists') ||
            errorMessage.toLowerCase().includes('duplicate'))
        ) {
          formState.errors.title = ['This title is already in use. Please choose a different one.'];
        } else {
          formState.errors = { general: [errorMessage] };
        }
      }

      formState.success = response.success;

      // Revalidate the create track page to clear data
      revalidatePath('/admin/tracks/new');
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
