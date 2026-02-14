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
    'artistIds',
    'releaseIds',
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

    const { title, duration, audioUrl, coverArt, position, artistIds, releaseIds, publishedOn } =
      parsed.data;

    // Update track in database
    const response = await TrackService.updateTrack(trackId, {
      title,
      duration,
      audioUrl,
      coverArt: coverArt || undefined,
      position: position ?? 0,
      ...(publishedOn && { publishedOn: new Date(publishedOn) }),
    });

    // Sync TrackArtist associations if artistIds provided
    if (response.success && artistIds) {
      const existingTrackArtists = await prisma.trackArtist.findMany({
        where: { trackId },
        select: { id: true, artistId: true },
      });

      const existingArtistIds = new Set(existingTrackArtists.map((ta) => ta.artistId));
      const newArtistIds = new Set(artistIds);

      const toDelete = existingTrackArtists.filter((ta) => !newArtistIds.has(ta.artistId));
      if (toDelete.length > 0) {
        await prisma.trackArtist.deleteMany({
          where: { id: { in: toDelete.map((ta) => ta.id) } },
        });
      }

      const toCreate = artistIds.filter((id) => !existingArtistIds.has(id));
      if (toCreate.length > 0) {
        await prisma.trackArtist.createMany({
          data: toCreate.map((artistId) => ({ artistId, trackId })),
        });
      }
    }

    // Sync ReleaseTrack associations if releaseIds provided
    if (response.success && releaseIds) {
      const existingReleaseTracks = await prisma.releaseTrack.findMany({
        where: { trackId },
        select: { id: true, releaseId: true },
      });

      const existingReleaseIds = new Set(existingReleaseTracks.map((rt) => rt.releaseId));
      const newReleaseIds = new Set(releaseIds);

      const toDeleteReleases = existingReleaseTracks.filter(
        (rt) => !newReleaseIds.has(rt.releaseId)
      );
      if (toDeleteReleases.length > 0) {
        await prisma.releaseTrack.deleteMany({
          where: { id: { in: toDeleteReleases.map((rt) => rt.id) } },
        });
      }

      const toCreateReleases = releaseIds.filter((id) => !existingReleaseIds.has(id));
      if (toCreateReleases.length > 0) {
        await prisma.releaseTrack.createMany({
          data: toCreateReleases.map((releaseId) => ({
            releaseId,
            trackId,
            position: position ?? 0,
          })),
        });
      }
    }

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
