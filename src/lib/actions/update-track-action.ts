'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { TrackService } from '../services/track-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import getActionState from '../utils/auth/get-action-state';
import { createTrackSchema } from '../validation/create-track-schema';

import type { FormState } from '../types/form-state';

export const updateTrackAction = async (
  trackId: string,
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
    'publishedOn',
  ];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createTrackSchema);

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
    // Get current user session
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      formState.success = false;
      if (!formState.errors) {
        formState.errors = {};
      }
      formState.errors.general = ['You must be a logged in admin user to update a track'];
      return formState;
    }

    const { title, duration, audioUrl, coverArt, position, publishedOn } = parsed.data;

    // Update track in database
    const response = await TrackService.updateTrack(trackId, {
      title,
      duration,
      audioUrl,
      coverArt: coverArt || undefined,
      position: position ?? 0,
      ...(publishedOn && { publishedOn: new Date(publishedOn) }),
    });

    // Log track update for security audit
    logSecurityEvent({
      event: 'media.track.updated',
      userId: session.user.id,
      metadata: {
        trackId,
        updatedFields: Object.keys(parsed.data).filter(
          (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
        ),
        success: response.success,
      },
    });

    if (response.success) {
      formState.errors = undefined;
      formState.data = { trackId };
    } else {
      if (!formState.errors) {
        formState.errors = {};
      }

      const errorMessage = response.error || 'Failed to update track';

      // Check if error is related to title uniqueness
      if (
        errorMessage.toLowerCase().includes('title') &&
        (errorMessage.toLowerCase().includes('unique') ||
          errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes('duplicate'))
      ) {
        formState.errors.title = ['This title is already in use. Please choose a different one.'];
      } else if (errorMessage.toLowerCase().includes('not found')) {
        formState.errors.general = ['Track not found'];
      } else {
        formState.errors = { general: [errorMessage] };
      }
    }

    formState.success = response.success;

    // Revalidate the track page to reflect updates
    revalidatePath(`/admin/tracks/${trackId}`);
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
