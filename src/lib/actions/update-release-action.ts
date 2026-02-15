/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import type { Format } from '@/lib/types/media-models';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

import { prisma } from '../prisma';
import { ReleaseService } from '../services/release-service';
import { createReleaseSchema } from '../validation/create-release-schema';

import type { FormState } from '../types/form-state';

export const updateReleaseAction = async (
  releaseId: string,
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  // Validate releaseId format
  if (!OBJECT_ID_REGEX.test(releaseId)) {
    return {
      fields: {},
      success: false,
      errors: { general: ['Invalid release ID'] },
    };
  }

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
    'notes',
    'executiveProducedBy',
    'coProducedBy',
    'masteredBy',
    'mixedBy',
    'recordedBy',
    'artBy',
    'designBy',
    'photographyBy',
    'linerNotesBy',
    'publishedAt',
    'featuredOn',
    'featuredUntil',
    'featuredDescription',
  ];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createReleaseSchema);

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
      title,
      releasedOn,
      coverArt,
      formats,
      artistIds,
      groupIds,
      labels,
      catalogNumber,
      description,
      notes,
      executiveProducedBy,
      coProducedBy,
      masteredBy,
      mixedBy,
      recordedBy,
      artBy,
      designBy,
      photographyBy,
      linerNotesBy,
      publishedAt,
      featuredOn,
      featuredUntil,
      featuredDescription,
    } = parsed.data;

    // Parse comma-separated strings to arrays
    const parseToArray = (value: string | undefined): string[] =>
      value
        ? value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : [];

    // Update release in database
    const response = await ReleaseService.updateRelease(releaseId, {
      title,
      releasedOn: new Date(releasedOn),
      coverArt,
      formats: (formats || ['DIGITAL']) as Format[],
      labels: parseToArray(labels),
      catalogNumber: catalogNumber || undefined,
      description: description || undefined,
      notes: parseToArray(notes),
      executiveProducedBy: parseToArray(executiveProducedBy),
      coProducedBy: parseToArray(coProducedBy),
      masteredBy: parseToArray(masteredBy),
      mixedBy: parseToArray(mixedBy),
      recordedBy: parseToArray(recordedBy),
      artBy: parseToArray(artBy),
      designBy: parseToArray(designBy),
      photographyBy: parseToArray(photographyBy),
      linerNotesBy: parseToArray(linerNotesBy),
      publishedAt: publishedAt ? new Date(publishedAt) : undefined,
      featuredOn: featuredOn ? new Date(featuredOn) : undefined,
      featuredUntil: featuredUntil ? new Date(featuredUntil) : undefined,
      featuredDescription: featuredDescription || undefined,
    });

    // Sync ArtistRelease associations if artistIds provided
    if (response.success && artistIds) {
      // Get current artist associations
      const existingArtistReleases = await prisma.artistRelease.findMany({
        where: { releaseId },
        select: { id: true, artistId: true },
      });

      const existingArtistIds = new Set(existingArtistReleases.map((ar) => ar.artistId));
      const newArtistIds = new Set(artistIds);

      // Delete removed and create new associations in parallel
      const toDelete = existingArtistReleases.filter((ar) => !newArtistIds.has(ar.artistId));
      const toCreate = artistIds.filter((id) => !existingArtistIds.has(id));

      const ops: Promise<unknown>[] = [];
      if (toDelete.length > 0) {
        ops.push(
          prisma.artistRelease.deleteMany({
            where: { id: { in: toDelete.map((ar) => ar.id) } },
          })
        );
      }
      if (toCreate.length > 0) {
        ops.push(
          prisma.artistRelease.createMany({
            data: toCreate.map((artistId) => ({ artistId, releaseId })),
          })
        );
      }
      await Promise.all(ops);
    }

    // groupIds is validated but not persisted (no GroupRelease model in schema yet)
    void groupIds;

    // Log release update for security audit
    logSecurityEvent({
      event: 'media.release.updated',
      userId: session.user.id,
      metadata: {
        releaseId,
        updatedFields: Object.keys(parsed.data).filter(
          (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
        ),
        success: response.success,
      },
    });

    if (response.success) {
      formState.errors = undefined;
      formState.data = { releaseId };
    } else {
      if (!formState.errors) {
        formState.errors = {};
      }

      const errorMessage = response.error || 'Failed to update release';

      // Check if error is related to title uniqueness
      if (
        errorMessage.toLowerCase().includes('title') &&
        (errorMessage.toLowerCase().includes('unique') ||
          errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes('duplicate'))
      ) {
        formState.errors.title = ['This title is already in use. Please choose a different one.'];
      } else if (errorMessage.toLowerCase().includes('not found')) {
        formState.errors.general = ['Release not found'];
      } else {
        formState.errors = { general: ['Failed to update release'] };
      }
    }

    formState.success = response.success;

    // Revalidate the release page to reflect updates
    revalidatePath(`/admin/releases/${releaseId}`);
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
