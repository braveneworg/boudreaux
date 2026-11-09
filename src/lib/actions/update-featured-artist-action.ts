/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import type { UpdateFeaturedArtistData } from '@/lib/types/domain/featured-artist';
import type { FormState } from '@/lib/types/form-state';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
import { readActionInput } from '@/lib/utils/forms/read-action-input';
import { toClearableString } from '@/lib/utils/forms/to-clearable-string';
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

/**
 * Projects the parsed form values onto the repository's update shape.
 *
 * Differs from the create payload in two ways that matter: `featuredOn` is left
 * unwritten when blank rather than defaulting to now (which would re-stamp the
 * feature window on every save), and `publishedOn` is never written at all
 * (which would publish a draft as a side effect of an unrelated edit).
 *
 * A field the admin emptied is cleared, not kept: a blank `displayName`,
 * `description` or `coverArt` becomes `null` (`toClearableString`), a blank
 * `featuredUntil` (the date picker's Clear) becomes `null` (feature
 * indefinitely), and a missing `featuredTrackNumber` becomes `null` (start
 * at track 1), because picking another release resets it to nothing. This
 * is the whole-entity edit save, so every field is always sent.
 *
 * `artistIds` becomes a relation `set`, replacing the connected artists rather
 * than appending to them, and is omitted entirely when none were submitted.
 */
const buildUpdateData = (data: ParsedData, artistIds: string[]): UpdateFeaturedArtistData => ({
  displayName: toClearableString(data.displayName),
  description: toClearableString(data.description),
  coverArt: toClearableString(data.coverArt),
  position: data.position,
  featuredTrackNumber: data.featuredTrackNumber ?? null,
  ...(data.featuredOn && { featuredOn: new Date(data.featuredOn) }),
  ...(data.featuredUntil !== undefined && {
    featuredUntil: data.featuredUntil ? new Date(data.featuredUntil) : null,
  }),
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
 * @param input - The form's values plus the release's `artistIds`; blanks are
 *   kept, because a blank is how the admin clears a field.
 * @returns The form state carrying the updated id or the mapped errors.
 */
export const updateFeaturedArtistAction = async (
  featuredArtistId: string,
  input: FeaturedArtistActionInput
): Promise<FormState> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return refusedFormState(gate);
  }
  const { session } = gate;

  const { formState, parsed } = readActionInput(
    input,
    PERMITTED_FIELD_NAMES,
    featuredArtistActionSchema,
    { blankStrings: 'keep' }
  );

  if (!parsed.success) {
    formState.success = false;
    applyZodIssuesToFormState(formState, parsed.error);
    return formState;
  }

  const { artistIds } = parsed.data;

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
