/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { UpdateArtistData } from '@/lib/types/domain/artist';
import type { FormState } from '@/lib/types/form-state';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
import { createArtistSchema } from '@/lib/validation/create-artist-schema';
import { logSecurityEvent } from '@/utils/audit-log';
import { setUnknownError } from '@/utils/auth/auth-utils';

const PERMITTED_FIELD_NAMES = [
  'firstName',
  'surname',
  'slug',
  'displayName',
  'middleName',
  'title',
  'suffix',
  'akaNames',
  'bio',
  'shortBio',
  'altBio',
  'genres',
  'tags',
  'bornOn',
  'diedOn',
  'formedOn',
  'publishedOn',
] as const;

type ParsedArtistData = ReturnType<typeof createArtistSchema.parse>;

const toOptionalDate = (value: string | undefined): Date | undefined =>
  value ? new Date(value) : undefined;

const toOptionalString = (value: string | null | undefined): string | undefined =>
  value || undefined;

const buildArtistUpdatePayload = (data: ParsedArtistData): UpdateArtistData => ({
  firstName: data.firstName || '',
  surname: data.surname || '',
  slug: data.slug,
  middleName: toOptionalString(data.middleName),
  displayName: toOptionalString(data.displayName),
  title: toOptionalString(data.title),
  suffix: toOptionalString(data.suffix),
  akaNames: toOptionalString(data.akaNames),
  bio: toOptionalString(data.bio),
  shortBio: toOptionalString(data.shortBio),
  altBio: toOptionalString(data.altBio),
  genres: toOptionalString(data.genres),
  tags: toOptionalString(data.tags),
  bornOn: toOptionalDate(data.bornOn),
  diedOn: toOptionalDate(data.diedOn),
  formedOn: toOptionalDate(data.formedOn),
  publishedOn: toOptionalDate(data.publishedOn),
});

const applyServiceErrorToFormState = (formState: FormState, errorMessage: string): void => {
  if (!formState.errors) {
    formState.errors = {};
  }
  const lower = errorMessage.toLowerCase();
  const isSlugError =
    lower.includes('slug') &&
    (lower.includes('unique') || lower.includes('already exists') || lower.includes('duplicate'));
  if (isSlugError) {
    formState.errors.slug = ['This slug is already in use. Please choose a different one.'];
  } else {
    formState.errors = { general: [errorMessage] };
  }
};

export const updateArtistAction = async (
  artistId: string,
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');
  if (!session?.user?.id) {
    throw new Error('Invalid admin session: missing user id for audit logging.');
  }

  const { formState, parsed } = getActionState(payload, PERMITTED_FIELD_NAMES, createArtistSchema);

  if (!parsed.success) {
    formState.success = false;
    applyZodIssuesToFormState(formState, parsed.error);
    return formState;
  }

  try {
    const response = await ArtistService.updateArtist(
      artistId,
      buildArtistUpdatePayload(parsed.data)
    );

    logSecurityEvent({
      event: 'media.artist.updated',
      userId: session.user.id,
      metadata: {
        artistId,
        updatedFields: Object.keys(parsed.data).filter(
          (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
        ),
        success: response.success,
      },
    });

    if (response.success) {
      formState.errors = undefined;
      formState.data = { artistId: response.data?.id };
    } else {
      applyServiceErrorToFormState(formState, response.error ?? 'Failed to update artist');
    }

    formState.success = response.success;

    // Revalidate the artist pages
    revalidatePath('/admin/artists');
    revalidatePath(`/artists/${parsed.data.slug}`);

    // The artist's display name renders on release cards/listings, so refresh
    // the public release surfaces too.
    if (response.success) {
      ReleaseService.invalidateCache();
      revalidatePath('/releases');
    }
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
