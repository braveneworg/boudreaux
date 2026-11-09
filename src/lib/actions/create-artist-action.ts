/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ArtistService } from '@/lib/services/artist-service';
import type { FormState } from '@/lib/types/form-state';
import { readActionInput } from '@/lib/utils/forms/read-action-input';
import { type ArtistFormData, createArtistSchema } from '@/lib/validation/create-artist-schema';
import { logSecurityEvent } from '@/utils/audit-log';
import { setUnknownError } from '@/utils/auth/auth-utils';

import { ARTIST_WRITE_FAILURES } from './artist-action-failures';
import { applyServiceFailure, refusedFormState } from './form-state-helpers';

/**
 * Server Action to create an artist from the artist form's values. Called
 * only by `useCreateArtistMutation`; the input is validated here, never
 * trusted. Blanks are omitted: an empty optional field is not written.
 */
export const createArtistAction = async (input: ArtistFormData): Promise<FormState> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return refusedFormState(gate);
  }
  const { session } = gate;

  // No `publishedOn`: an artist is created unpublished and published from
  // the edit form once it has a chosen display image (ADR-0019).
  const permittedFieldNames = [
    'firstName',
    'surname',
    'slug',
    'displayName',
    'middleName',
    'formedOn',
  ] as const;
  const { formState, parsed } = readActionInput(input, permittedFieldNames, createArtistSchema, {
    blankStrings: 'omit',
  });

  if (parsed.success) {
    try {
      const { firstName, surname, slug, middleName, displayName, formedOn } = parsed.data;

      // Create artist in database
      const response = await ArtistService.createArtist({
        firstName: firstName || '',
        surname: surname || '',
        slug,
        middleName,
        displayName,
        formedOn: formedOn ? new Date(formedOn) : undefined,
      });

      // Log artist creation for security audit
      logSecurityEvent({
        event: 'media.artist.created',
        userId: session.user.id,
        metadata: {
          createdFields: Object.keys(parsed.data).filter(
            (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
          ),
          success: response.success,
        },
      });

      if (response.success) {
        formState.errors = undefined;
        // Include the created artist ID in the response for image uploads
        formState.data = { artistId: response.data?.id };
      } else {
        applyServiceFailure(formState, response, ARTIST_WRITE_FAILURES);
      }

      formState.success = response.success;

      // Revalidate the create artist page to clear data
      revalidatePath('/admin/artist/new');
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
