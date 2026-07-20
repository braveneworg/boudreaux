/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { z } from 'zod';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import type { FormState } from '@/lib/types/form-state';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
import { cache } from '@/lib/utils/simple-cache';
import { createFeaturedArtistSchema } from '@/lib/validation/create-featured-artist-schema';
import { logSecurityEvent } from '@/utils/audit-log';
import { setUnknownError } from '@/utils/auth/auth-utils';

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
] as const;

// FormData sends all values as strings, so use z.coerce.number() for numeric fields
// on the server side (the client schema uses z.number() for React Hook Form compatibility)
const buildServerSchema = () =>
  createFeaturedArtistSchema.omit({ position: true, featuredTrackNumber: true }).extend({
    position: z.coerce
      .number()
      .int({ message: 'Position must be a whole number' })
      .min(0, { message: 'Position must be 0 or greater' }),
    featuredTrackNumber: z.coerce
      .number()
      .int({ message: 'Featured track number must be a whole number' })
      .min(1, { message: 'Featured track number must be at least 1' })
      .optional(),
  });

type ParsedData = ReturnType<ReturnType<typeof buildServerSchema>['parse']>;

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

export const createFeaturedArtistAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  if (!session?.user?.id) {
    throw new Error('Session user id is required for audit logging.');
  }

  const artistIds = payload.getAll('artistIds') as string[];
  payload.delete('artistIds');

  const { formState, parsed: baseParsed } = getActionState(
    payload,
    PERMITTED_FIELD_NAMES,
    buildServerSchema()
  );

  if (!baseParsed.success) {
    formState.success = false;
    applyZodIssuesToFormState(formState, baseParsed.error);
    return formState;
  }

  try {
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
