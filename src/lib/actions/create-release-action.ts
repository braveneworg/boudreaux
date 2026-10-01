/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ArtistCreditRepository } from '@/lib/repositories/artist-credit-repository';
import { CreditConfirmationService } from '@/lib/services/credit-confirmation-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { ServiceResponse } from '@/lib/services/service.types';
import type { Release } from '@/lib/types/domain/release';
import type { FormState } from '@/lib/types/form-state';
import type { Format } from '@/lib/types/media-models';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import type { CreditDecisions } from '@/lib/utils/credit-confirmation';
import { readCreditDecisions } from '@/lib/utils/forms/read-credit-decisions';
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
    await ArtistCreditRepository.addCredits(response.data.id, artistIds);
  }
};

/**
 * Put a credit-confirmation failure on the form. Its message names the artists
 * that need a decision, so it is shown as written.
 */
const applyCreditFailure = (formState: FormState, message: string): void => {
  formState.success = false;
  formState.errors = { ...formState.errors, general: [message] };
};

interface ReleaseCreate {
  data: ReleaseFormData;
  preGeneratedId: string | undefined;
  decisions: CreditDecisions;
  adminUserId: string;
}

interface ReleaseCreateResult {
  /** Absent when the decisions failed the check and nothing was written. */
  response?: ServiceResponse<Release>;
  /** Why the release is not published: an undecided credit, or a failed publish. */
  creditFailure?: string;
}

/**
 * Create the release, store its credits, then publish it when the form asked
 * for that. A release is created unpublished and published once its credits
 * are stored, so the decisions are checked before anything is written.
 */
const createAndPublish = async ({
  data,
  preGeneratedId,
  decisions,
  adminUserId,
}: ReleaseCreate): Promise<ReleaseCreateResult> => {
  const publishes = Boolean(data.publishedAt);
  if (publishes) {
    const checked = await CreditConfirmationService.check(
      { artistIds: data.artistIds ?? [] },
      decisions
    );
    if (!checked.success) {
      return { creditFailure: checked.error };
    }
  }

  const response = await ReleaseService.createRelease(
    buildReleaseCreateInput(data, preGeneratedId)
  );
  await createArtistReleaseAssociations(response, data.artistIds);
  if (!publishes || !response.success) {
    return { response };
  }

  const published = await ReleaseService.publishRelease(response.data.id, {
    decisions,
    publishedBy: adminUserId,
  });
  return published.success ? { response } : { response, creditFailure: published.error };
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
  ] as const;
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createReleaseSchema);

  if (parsed.success) {
    const credit = readCreditDecisions(payload);
    if (!credit.ok) {
      applyCreditFailure(formState, 'Invalid artist decisions');
      return formState;
    }

    try {
      const { response, creditFailure } = await createAndPublish({
        data: parsed.data,
        preGeneratedId,
        decisions: credit.decisions,
        adminUserId: session.user.id,
      });
      if (!response) {
        applyCreditFailure(formState, creditFailure ?? 'Invalid artist decisions');
        return formState;
      }

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

      // The release is saved; only publishing it failed.
      if (creditFailure) {
        applyCreditFailure(formState, creditFailure);
      }
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
