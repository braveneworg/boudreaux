'use server';

import { revalidatePath } from 'next/cache';

import type { Format } from '@/lib/types/media-models';
import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { ReleaseService } from '../services/release-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import getActionState from '../utils/auth/get-action-state';
import { createReleaseSchema } from '../validation/create-release-schema';

import type { FormState } from '../types/form-state';

export const createReleaseAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  await requireRole('admin');

  const permittedFieldNames = [
    'title',
    'releasedOn',
    'coverArt',
    'formats',
    'artistIds',
    'groupIds',
    'labels',
    'catalogNumber',
    'description',
    'publishedAt',
  ];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createReleaseSchema);

  if (parsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id || session?.user?.role !== 'admin') {
        formState.success = false;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = ['You must be a logged in admin user to create a release'];
        return formState;
      }

      const {
        title,
        releasedOn,
        coverArt,
        formats,
        artistIds,
        groupIds,
        labels,
        catalogNumber,
        description,
      } = parsed.data;

      // Parse labels from comma-separated string to array
      const labelsArray = labels
        ? labels
            .split(',')
            .map((l) => l.trim())
            .filter(Boolean)
        : [];

      // Create release in database
      const response = await ReleaseService.createRelease({
        title,
        releasedOn: new Date(releasedOn),
        coverArt,
        formats: (formats || ['DIGITAL']) as Format[],
        labels: labelsArray,
        catalogNumber: catalogNumber || undefined,
        description: description || undefined,
      });

      // Create ArtistRelease associations if release was created and artistIds provided
      if (response.success && response.data?.id && artistIds && artistIds.length > 0) {
        const createdReleaseId = response.data.id;
        await prisma.artistRelease.createMany({
          data: artistIds.map((artistId) => ({ artistId, releaseId: createdReleaseId })),
        });
      }

      // groupIds is validated but not persisted (no GroupRelease model in schema yet)
      void groupIds;

      // Log release creation for security audit
      logSecurityEvent({
        event: 'media.release.created',
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
        // Include the created release ID in the response for image uploads
        formState.data = { releaseId: response.data?.id };
      } else {
        if (!formState.errors) {
          formState.errors = {};
        }

        const errorMessage = response.error || 'Failed to create release';

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

      // Revalidate the create release page to clear data
      revalidatePath('/admin/releases/new');
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
