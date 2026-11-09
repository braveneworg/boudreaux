/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import type { FormState } from '@/lib/types/form-state';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
import { readActionInput } from '@/lib/utils/forms/read-action-input';
import { cache } from '@/lib/utils/simple-cache';
import {
  type FeaturedArtistActionInput,
  featuredArtistActionSchema,
} from '@/lib/validation/create-featured-artist-schema';
import { logSecurityEvent } from '@/utils/audit-log';
import { setUnknownError } from '@/utils/auth/auth-utils';

import { refusedFormState } from './form-state-helpers';

const PERMITTED_FIELD_NAMES = [
  'displayName',
  'description',
  'coverArt',
  'position',
  'featuredOn',
  'featuredUntil',
  'digitalFormatId',
  'releaseId',
  'featuredTrackNumber',
  'artistIds',
] as const;

type ParsedData = FeaturedArtistActionInput;

const buildCreateData = (data: ParsedData, artistIds: string[]) => ({
  displayName: data.displayName || undefined,
  description: data.description || undefined,
  coverArt: data.coverArt || undefined,
  position: data.position ?? 0,
  featuredOn: data.featuredOn ? new Date(data.featuredOn) : new Date(),
  featuredUntil: data.featuredUntil ? new Date(data.featuredUntil) : undefined,
  featuredTrackNumber: data.featuredTrackNumber ?? undefined,
  publishedOn: new Date(),
  artists: {
    connect: artistIds.map((id) => ({ id })),
  },
  ...(data.digitalFormatId && { digitalFormat: { connect: { id: data.digitalFormatId } } }),
  ...(data.releaseId && { release: { connect: { id: data.releaseId } } }),
});

/**
 * Server Action to create a featured artist from the form's values and the
 * release's artists. Called only by `useCreateFeaturedArtistMutation`; the
 * input is validated here, never trusted. Blanks are omitted.
 */
export const createFeaturedArtistAction = async (
  input: FeaturedArtistActionInput
): Promise<FormState> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return refusedFormState(gate);
  }
  const { session } = gate;

  const { formState, parsed: baseParsed } = readActionInput(
    input,
    PERMITTED_FIELD_NAMES,
    featuredArtistActionSchema,
    { blankStrings: 'omit' }
  );

  if (!baseParsed.success) {
    formState.success = false;
    applyZodIssuesToFormState(formState, baseParsed.error);
    return formState;
  }

  try {
    const { artistIds } = baseParsed.data;
    const createData = buildCreateData(baseParsed.data, artistIds);
    const response = await FeaturedArtistsService.createFeaturedArtist(createData);

    logSecurityEvent({
      event: 'media.featured_artist.created',
      userId: session.user.id,
      metadata: {
        createdFields: Object.keys(baseParsed.data).filter(
          (key) => baseParsed.data[key as keyof typeof baseParsed.data] !== undefined
        ),
        artistCount: artistIds.length,
        success: response.success,
      },
    });

    if (response.success) {
      formState.errors = undefined;
      formState.data = { featuredArtistId: response.data?.id };
    } else {
      formState.errors = { general: [response.error || 'Failed to create featured artist'] };
    }

    formState.success = response.success;

    revalidatePath('/admin/featured-artists/new');
    revalidatePath('/admin');

    if (response.success) {
      cache.deleteByPrefix('featured-artists:');
      revalidatePath('/');
    }
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
