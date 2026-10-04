/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ReleaseService } from '@/lib/services/release-service';
import type { UpdateReleaseData } from '@/lib/types/domain/release';
import type { FormState } from '@/lib/types/form-state';
import type { Format } from '@/lib/types/media-models';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import type { CreditDecisions } from '@/lib/utils/credit-confirmation';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
import { readCreditDecisions } from '@/lib/utils/forms/read-credit-decisions';
import { toClearableString } from '@/lib/utils/forms/to-clearable-string';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';
import { createReleaseSchema } from '@/lib/validation/create-release-schema';

const PERMITTED_FIELD_NAMES = [
  'title',
  'releasedOn',
  'coverArt',
  'formats',
  'artistIds',
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
  'suggestedPrice',
] as const;

const parseToArray = (value: string | undefined): string[] =>
  value
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

/**
 * Splits free prose into one entry per non-blank line. Release notes are
 * paragraphs, not a comma list — splitting them on commas would shred any
 * sentence containing one (and every generated note contains several).
 */
const parseToParagraphs = (value: string | undefined): string[] =>
  value
    ? value
        .split(/\r?\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];

const buildReleaseUpdateInput = (data: {
  title: string;
  releasedOn: string;
  coverArt: string;
  formats?: string[];
  labels?: string;
  catalogNumber?: string;
  description?: string;
  notes?: string;
  executiveProducedBy?: string;
  coProducedBy?: string;
  masteredBy?: string;
  mixedBy?: string;
  recordedBy?: string;
  artBy?: string;
  designBy?: string;
  photographyBy?: string;
  linerNotesBy?: string;
  publishedAt?: string;
  featuredOn?: string;
  featuredUntil?: string;
  featuredDescription?: string;
  suggestedPrice?: string;
}): UpdateReleaseData => {
  const suggestedPriceCents =
    data.suggestedPrice && data.suggestedPrice !== ''
      ? Math.round(parseFloat(data.suggestedPrice) * 100)
      : null;

  return {
    title: data.title,
    releasedOn: new Date(data.releasedOn),
    coverArt: data.coverArt,
    formats: (data.formats || ['DIGITAL']) as Format[],
    labels: parseToArray(data.labels),
    catalogNumber: toClearableString(data.catalogNumber),
    description: toClearableString(data.description),
    notes: parseToParagraphs(data.notes),
    executiveProducedBy: parseToArray(data.executiveProducedBy),
    coProducedBy: parseToArray(data.coProducedBy),
    masteredBy: parseToArray(data.masteredBy),
    mixedBy: parseToArray(data.mixedBy),
    recordedBy: parseToArray(data.recordedBy),
    artBy: parseToArray(data.artBy),
    designBy: parseToArray(data.designBy),
    photographyBy: parseToArray(data.photographyBy),
    linerNotesBy: parseToArray(data.linerNotesBy),
    publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
    featuredOn: data.featuredOn ? new Date(data.featuredOn) : undefined,
    featuredUntil: data.featuredUntil ? new Date(data.featuredUntil) : undefined,
    featuredDescription: toClearableString(data.featuredDescription),
    suggestedPrice: suggestedPriceCents,
  };
};

/**
 * Put a credit-confirmation failure on the form. Its message names the artists
 * that need a decision, so it is shown as written rather than replaced by the
 * generic update failure.
 */
const applyCreditFailure = (formState: FormState, message: string): void => {
  formState.success = false;
  formState.errors = { ...formState.errors, general: [message] };
};

type ParsedRelease = Parameters<typeof buildReleaseUpdateInput>[0] & { artistIds?: string[] };

interface ReleaseWrite {
  releaseId: string;
  data: ParsedRelease;
  decisions: CreditDecisions;
  adminUserId: string;
}

type ReleaseWriteResult = Awaited<ReturnType<typeof ReleaseService.updateRelease>>;

/**
 * Save the release with its credits. The service stores the form's credits
 * and, when the save publishes, checks the admin's decisions against them and
 * publishes the confirmed artists, all in one transaction (ADR-0015).
 */
const writeRelease = ({
  releaseId,
  data,
  decisions,
  adminUserId,
}: ReleaseWrite): Promise<ReleaseWriteResult> =>
  ReleaseService.updateRelease(releaseId, buildReleaseUpdateInput(data), {
    decisions,
    publishedBy: adminUserId,
    creditArtistIds: data.artistIds,
  });

/** Put the outcome of the write on the form and refresh the affected pages. */
const applyWriteResult = (
  formState: FormState,
  releaseId: string,
  response: ReleaseWriteResult
): void => {
  if (response.success) {
    formState.errors = undefined;
    formState.data = { releaseId };
  } else {
    formState.errors = formState.errors ?? {};
    mapReleaseServiceError(response.error || 'Failed to update release', formState);
  }
  formState.success = response.success;

  revalidatePath(`/admin/releases/${releaseId}`);
  if (response.success) {
    ReleaseService.invalidateCache();
    revalidatePath('/releases');
    revalidatePath(`/releases/${releaseId}`);
    revalidatePath('/artists/[slug]', 'page');
  }
};

const mapReleaseServiceError = (errorMessage: string, formState: FormState): void => {
  const msg = errorMessage.toLowerCase();
  const isTitleError =
    msg.includes('title') &&
    (msg.includes('unique') || msg.includes('already exists') || msg.includes('duplicate'));

  if (isTitleError) {
    formState.errors = {
      ...formState.errors,
      title: ['This title is already in use. Please choose a different one.'],
    };
  } else if (msg.includes('not found')) {
    formState.errors = { ...formState.errors, general: ['Release not found'] };
  } else {
    formState.errors = { general: ['Failed to update release'] };
  }
};

export const updateReleaseAction = async (
  releaseId: string,
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  if (!OBJECT_ID_REGEX.test(releaseId)) {
    return {
      fields: {},
      success: false,
      errors: { general: ['Invalid release ID'] },
    };
  }

  const { formState, parsed } = getActionState(payload, PERMITTED_FIELD_NAMES, createReleaseSchema);

  if (!parsed.success) {
    formState.success = false;
    applyZodIssuesToFormState(formState, parsed.error);
    return formState;
  }

  const credit = readCreditDecisions(payload);
  if (!credit.ok) {
    applyCreditFailure(formState, 'Invalid artist decisions');
    return formState;
  }

  try {
    const response = await writeRelease({
      releaseId,
      data: parsed.data,
      decisions: credit.decisions,
      adminUserId: session.user.id,
    });

    if (!response.success && response.code === 'VALIDATION') {
      applyCreditFailure(formState, response.error);
      return formState;
    }

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

    applyWriteResult(formState, releaseId, response);
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
