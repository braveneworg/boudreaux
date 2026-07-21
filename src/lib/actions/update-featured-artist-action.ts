/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { z } from 'zod';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import type { UpdateFeaturedArtistData } from '@/lib/types/domain/featured-artist';
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

// FormData sends every value as a string, so the numeric fields are coerced
// server-side; the client schema keeps `z.number()` for React Hook Form.
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

/**
 * Projects the parsed form values onto the repository's update shape.
 *
 * Differs from the create payload in two ways that matter: `featuredOn` is left
 * unwritten when blank rather than defaulting to now (which would re-stamp the
 * feature window on every save), and `publishedOn` is never written at all
 * (which would publish a draft as a side effect of an unrelated edit).
 *
 * `artistIds` becomes a relation `set`, replacing the connected artists rather
 * than appending to them, and is omitted entirely when none were submitted.
 */
const buildUpdateData = (data: ParsedData, artistIds: string[]): UpdateFeaturedArtistData => ({
  displayName: data.displayName || undefined,
  description: data.description || undefined,
  coverArt: data.coverArt || undefined,
  position: data.position,
  featuredTrackNumber: data.featuredTrackNumber ?? undefined,
  ...(data.featuredOn && { featuredOn: new Date(data.featuredOn) }),
  ...(data.featuredUntil && { featuredUntil: new Date(data.featuredUntil) }),
  ...(artistIds.length > 0 && { artists: { set: artistIds.map((id) => ({ id })) } }),
  ...(data.digitalFormatId && { digitalFormat: { connect: { id: data.digitalFormatId } } }),
  ...(data.releaseId && { release: { connect: { id: data.releaseId } } }),
});

/**
 * Server Action to update a featured artist. Mirrors the create action's
 * validation and audit shape, and replaces the `PATCH /api/featured-artists/[id]`
 * route the edit form used to call directly.
 *
 * @param featuredArtistId - The featured-artist row to update.
 * @param payload - The submitted form fields plus repeated `artistIds` entries.
 * @returns The form state carrying the updated id or the mapped errors.
 */
export const updateFeaturedArtistAction = async (
  featuredArtistId: string,
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  if (!session?.user?.id) {
    throw new Error('Session user id is required for audit logging.');
  }

  const artistIds = payload.getAll('artistIds') as string[];
  payload.delete('artistIds');

  const { formState, parsed } = getActionState(payload, PERMITTED_FIELD_NAMES, buildServerSchema());

  if (!parsed.success) {
    formState.success = false;
    applyZodIssuesToFormState(formState, parsed.error);
    return formState;
  }

  try {
    const response = await FeaturedArtistsService.updateFeaturedArtist(
      featuredArtistId,
      buildUpdateData(parsed.data, artistIds)
    );

    logSecurityEvent({
      event: 'media.featured_artist.updated',
      userId: session.user.id,
      metadata: {
        featuredArtistId,
        updatedFields: Object.keys(parsed.data).filter(
          (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
        ),
        artistCount: artistIds.length,
        success: response.success,
      },
    });

    if (response.success) {
      formState.errors = undefined;
      formState.data = { featuredArtistId };
    } else {
      formState.errors = { general: [response.error || 'Failed to update featured artist'] };
    }

    formState.success = response.success;

    revalidatePath('/admin/featured-artists');
    revalidatePath('/admin');

    // The landing-page carousel reads through this cache, so an edit is
    // invisible until it is dropped.
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
