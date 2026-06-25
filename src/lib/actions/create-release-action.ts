/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { ReleaseService } from '@/lib/services/release-service';
import type { ServiceResponse } from '@/lib/services/service.types';
import type { Release } from '@/lib/types/domain/release';
import type { FormState } from '@/lib/types/form-state';
import type { Format } from '@/lib/types/media-models';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import { createReleaseSchema } from '@/lib/validation/create-release-schema';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

const buildReleaseCreateInput = (data: ReleaseFormData, preGeneratedId: string | undefined) => {
  const {
    title,
    releasedOn,
    coverArt,
    formats,
    labels,
    catalogNumber,
    description,
    suggestedPrice,
  } = data;

  const labelsArray = labels
    ? labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  const suggestedPriceCents =
    suggestedPrice && suggestedPrice !== ''
      ? Math.round(parseFloat(suggestedPrice) * 100)
      : undefined;

  return {
    ...(preGeneratedId !== undefined ? { id: preGeneratedId } : {}),
    title,
    releasedOn: new Date(releasedOn),
    coverArt,
    formats: (formats || ['DIGITAL']) as Format[],
    labels: labelsArray,
    catalogNumber: catalogNumber || undefined,
    description: description || undefined,
    suggestedPrice: suggestedPriceCents,
  };
};

const applyServiceResponseToFormState = (
  formState: FormState,
  response: ServiceResponse<Release>
): void => {
  if (response.success) {
    formState.errors = undefined;
    formState.data = { releaseId: response.data?.id };
  } else {
    if (!formState.errors) {
      formState.errors = {};
    }
    const errorMessage = response.error || 'Failed to create release';
    const lower = errorMessage.toLowerCase();
    const isTitleConflict =
      lower.includes('title') &&
      (lower.includes('unique') || lower.includes('already exists') || lower.includes('duplicate'));
    if (isTitleConflict) {
      formState.errors.title = ['This title is already in use. Please choose a different one.'];
    } else {
      formState.errors = { general: ['Failed to create release'] };
    }
  }
  formState.success = response.success;
};

const createArtistReleaseAssociations = async (
  response: ServiceResponse<Release>,
  artistIds: string[] | undefined
): Promise<void> => {
  if (response.success && response.data?.id && artistIds && artistIds.length > 0) {
    const createdReleaseId = response.data.id;
    await prisma.artistRelease.createMany({
      data: artistIds.map((artistId) => ({ artistId, releaseId: createdReleaseId })),
    });
  }
};

export const createReleaseAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  // Read the pre-generated ObjectId set by the client before calling getActionState,
  // since getActionState strips fields not in permittedFieldNames.
  const rawPreGeneratedId = payload.get('preGeneratedId');
  const preGeneratedId =
    typeof rawPreGeneratedId === 'string' && isValidObjectId(rawPreGeneratedId)
      ? rawPreGeneratedId
      : undefined;

  const permittedFieldNames = [
    'title',
    'releasedOn',
    'coverArt',
    'formats',
    'artistIds',
    'labels',
    'catalogNumber',
    'description',
    'publishedAt',
    'suggestedPrice',
  ];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createReleaseSchema);

  if (parsed.success) {
    try {
      const response = await ReleaseService.createRelease(
        buildReleaseCreateInput(parsed.data, preGeneratedId)
      );

      await createArtistReleaseAssociations(response, parsed.data.artistIds);

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

      applyServiceResponseToFormState(formState, response);

      // Revalidate the create release page to clear data
      revalidatePath('/admin/releases/new');

      // A newly created release may already be published; clear the cached
      // public listing and revalidate the public surfaces that show it.
      if (response.success) {
        ReleaseService.invalidateCache();
        revalidatePath('/releases');
        revalidatePath('/artists/[slug]', 'page');
      }
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
