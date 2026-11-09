/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ArtistService } from '@/lib/services/artist-service';
import type { UpdateArtistData } from '@/lib/types/domain/artist';
import type { FormState } from '@/lib/types/form-state';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
import { readActionInput } from '@/lib/utils/forms/read-action-input';
import { toClearableString } from '@/lib/utils/forms/to-clearable-string';
import { normalizeArtistLinks } from '@/lib/utils/sanitize-artist-links';
import { type ArtistFormData, createArtistSchema } from '@/lib/validation/create-artist-schema';
import { logSecurityEvent } from '@/utils/audit-log';
import { setUnknownError } from '@/utils/auth/auth-utils';

import { ARTIST_WRITE_FAILURES } from './artist-action-failures';
import { applyServiceFailure, refusedFormState } from './form-state-helpers';

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
  'websiteLinks',
  'socialLinks',
  'contactLinkGroups',
] as const;

type ParsedArtistData = ReturnType<typeof createArtistSchema.parse>;

const toOptionalDate = (value: string | undefined): Date | undefined =>
  value ? new Date(value) : undefined;

/**
 * The links composite the form's three arrays compose (ADR-0020), or nothing
 * when the form did not send them, so an older client's save leaves the
 * stored links alone.
 */
const toLinksPayload = ({
  websiteLinks,
  socialLinks,
  contactLinkGroups,
}: ParsedArtistData): Pick<UpdateArtistData, 'links'> =>
  // Any array present means the form has link editors: the ones it did not
  // send are empty, not "leave alone". Only a request with none at all (an
  // older client, the create form) leaves the stored links untouched.
  websiteLinks || socialLinks || contactLinkGroups
    ? {
        links: normalizeArtistLinks({
          websiteLinks: websiteLinks ?? [],
          socialLinks: socialLinks ?? [],
          contactLinkGroups: contactLinkGroups ?? [],
        }),
      }
    : {};

const buildArtistUpdatePayload = (data: ParsedArtistData): UpdateArtistData => ({
  firstName: data.firstName || '',
  surname: data.surname || '',
  slug: data.slug,
  middleName: toClearableString(data.middleName),
  displayName: toClearableString(data.displayName),
  title: toClearableString(data.title),
  suffix: toClearableString(data.suffix),
  akaNames: toClearableString(data.akaNames),
  bio: toClearableString(data.bio),
  shortBio: toClearableString(data.shortBio),
  altBio: toClearableString(data.altBio),
  genres: toClearableString(data.genres),
  tags: toClearableString(data.tags),
  bornOn: toOptionalDate(data.bornOn),
  diedOn: toOptionalDate(data.diedOn),
  formedOn: toOptionalDate(data.formedOn),
  publishedOn: toOptionalDate(data.publishedOn),
  ...toLinksPayload(data),
});

/**
 * Server Action to save the artist edit form. Called only by
 * `useUpdateArtistMutation`; the input is validated here, never trusted.
 * Blanks are kept: an emptied optional field is cleared to `null` (#759).
 */
export const updateArtistAction = async (
  artistId: string,
  input: ArtistFormData
): Promise<FormState> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return refusedFormState(gate);
  }
  const { session } = gate;

  const { formState, parsed } = readActionInput(input, PERMITTED_FIELD_NAMES, createArtistSchema, {
    blankStrings: 'keep',
  });

  if (!parsed.success) {
    formState.success = false;
    applyZodIssuesToFormState(formState, parsed.error);
    return formState;
  }

  try {
    const response = await ArtistService.updateArtist(
      artistId,
      buildArtistUpdatePayload(parsed.data),
      session.user.id
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
      applyServiceFailure(formState, response, ARTIST_WRITE_FAILURES);
    }

    formState.success = response.success;

    // Revalidate the artist pages
    revalidatePath('/admin/artists');
    revalidatePath(`/artists/${parsed.data.slug}`);

    // The artist's display name renders on release cards/listings, so refresh
    // the public release surfaces too.
    if (response.success) {
      revalidatePath('/releases');
    }
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
