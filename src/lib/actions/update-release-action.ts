/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { ReleaseService } from '@/lib/services/release-service';
import type { UpdateReleaseData } from '@/lib/types/domain/release';
import type { FormState } from '@/lib/types/form-state';
import type { Format } from '@/lib/types/media-models';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
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
    catalogNumber: data.catalogNumber || undefined,
    description: data.description || undefined,
    notes: parseToArray(data.notes),
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
    featuredDescription: data.featuredDescription || undefined,
    suggestedPrice: suggestedPriceCents,
  };
};

const syncArtistReleases = async (releaseId: string, artistIds: string[]): Promise<void> => {
  const existingArtistReleases = await prisma.artistRelease.findMany({
    where: { releaseId },
    select: { id: true, artistId: true },
  });

  const existingArtistIds = new Set(
    existingArtistReleases.map((ar: { id: string; artistId: string }) => ar.artistId)
  );
  const newArtistIds = new Set(artistIds);

  const toDelete = existingArtistReleases.filter(
    (ar: { id: string; artistId: string }) => !newArtistIds.has(ar.artistId)
  );
  const toCreate = artistIds.filter((artistId) => !existingArtistIds.has(artistId));

  const ops: Promise<unknown>[] = [];
  if (toDelete.length > 0) {
    ops.push(
      prisma.artistRelease.deleteMany({
        where: { id: { in: toDelete.map((ar: { id: string; artistId: string }) => ar.id) } },
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

  try {
    const response = await ReleaseService.updateRelease(
      releaseId,
      buildReleaseUpdateInput(parsed.data)
    );

    if (response.success && parsed.data.artistIds) {
      await syncArtistReleases(releaseId, parsed.data.artistIds);
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

    if (response.success) {
      formState.errors = undefined;
      formState.data = { releaseId };
    } else {
      if (!formState.errors) {
        formState.errors = {};
      }
      const errorMessage = response.error || 'Failed to update release';
      mapReleaseServiceError(errorMessage, formState);
    }

    formState.success = response.success;

    revalidatePath(`/admin/releases/${releaseId}`);

    if (response.success) {
      ReleaseService.invalidateCache();
      revalidatePath('/releases');
      revalidatePath(`/releases/${releaseId}`);
      revalidatePath('/artists/[slug]', 'page');
    }
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
