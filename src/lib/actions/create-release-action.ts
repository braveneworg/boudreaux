/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { CreditConfirmationService } from '@/lib/services/credit-confirmation-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { ServiceResponse } from '@/lib/services/service.types';
import type { Release } from '@/lib/types/domain/release';
import type { FormState } from '@/lib/types/form-state';
import type { Format } from '@/lib/types/media-models';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import type { CreditDecisions } from '@/lib/utils/credit-confirmation';
import { readActionInput, readPreGeneratedId } from '@/lib/utils/forms/read-action-input';
import { readCreditDecisions } from '@/lib/utils/forms/read-credit-decisions';
import { createReleaseSchema } from '@/lib/validation/create-release-schema';
import type {
  CreateReleaseActionInput,
  ReleaseFormData,
} from '@/lib/validation/create-release-schema';

import {
  applyServiceFailure,
  DUPLICATE_TITLE,
  type FailureFieldTable,
  refusedFormState,
} from './form-state-helpers';

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

/** A release's only unique field besides its id is its title (prisma/schema.prisma). */
const CREATE_RELEASE_FAILURES: FailureFieldTable = {
  fields: new Map([['DUPLICATE', DUPLICATE_TITLE]]),
  fallback: 'Failed to create release',
};

const applyServiceResponseToFormState = (
  formState: FormState,
  response: ServiceResponse<Release>
): void => {
  if (!response.success) {
    applyServiceFailure(formState, response, CREATE_RELEASE_FAILURES);
    return;
  }
  formState.errors = undefined;
  formState.data = { releaseId: response.data.id };
  formState.success = true;
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
 * Create the release with its credits in one write, then publish it when the
 * form asked for that. A release is created unpublished and published once
 * its credits are stored; the decisions are checked before anything is
 * written, and checked again inside the publish against the stored credits.
 */
const createAndPublish = async ({
  data,
  preGeneratedId,
  decisions,
  adminUserId,
}: ReleaseCreate): Promise<ReleaseCreateResult> => {
  const publishes = Boolean(data.publishedAt);
  if (publishes) {
    const checked = await CreditConfirmationService.check(data.artistIds ?? [], decisions);
    if (!checked.success) {
      return { creditFailure: checked.error };
    }
  }

  const response = await ReleaseService.createRelease(
    buildReleaseCreateInput(data, preGeneratedId),
    data.artistIds ?? []
  );
  if (!publishes || !response.success) {
    return { response };
  }

  const published = await ReleaseService.publishRelease(response.data.id, {
    decisions,
    publishedBy: adminUserId,
  });
  return published.success ? { response } : { response, creditFailure: published.error };
};

/**
 * Server Action to create a release from the release form's values, the
 * pre-generated id and the admin's credit decisions. Called only by
 * `useCreateReleaseMutation`; the input is validated here, never trusted.
 * Blanks are omitted: an empty optional field is not written.
 */
export const createReleaseAction = async (input: CreateReleaseActionInput): Promise<FormState> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return refusedFormState(gate);
  }
  const { session } = gate;

  // Not a form field, so `readActionInput` drops it; read it on its own.
  const preGeneratedId = readPreGeneratedId(input);

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
  const { formState, parsed } = readActionInput(input, permittedFieldNames, createReleaseSchema, {
    blankStrings: 'omit',
  });

  if (parsed.success) {
    const credit = readCreditDecisions(input);
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

      // A newly created release may already be published; revalidate the
      // public surfaces that show it.
      if (response.success) {
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
