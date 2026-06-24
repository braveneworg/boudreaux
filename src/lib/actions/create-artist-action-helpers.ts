/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';

import { ensureFormErrors } from './form-state-helpers';

/**
 * True when an artist-create error message indicates a slug uniqueness
 * collision, so the client can surface it on the slug field rather than as a
 * generic error.
 */
const isSlugUniquenessError = (errorMessage: string): boolean => {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('slug') &&
    (lower.includes('unique') || lower.includes('already exists') || lower.includes('duplicate'))
  );
};

/**
 * Map a failed `ArtistService.createArtist` response onto `formState`. A slug
 * collision becomes a field-level `slug` error; anything else becomes a
 * top-level `general` error. Mirrors the prior inline branches exactly.
 */
export const applyCreateArtistFailure = (formState: FormState, responseError?: string): void => {
  const errorMessage = responseError || 'Failed to create artist';

  if (isSlugUniquenessError(errorMessage)) {
    ensureFormErrors(formState).slug = [
      'This slug is already in use. Please choose a different one.',
    ];
    return;
  }

  formState.errors = { general: [errorMessage] };
};
