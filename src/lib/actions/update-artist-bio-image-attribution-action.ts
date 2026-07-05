/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';
import { sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
import {
  updateBioImageAttributionInputSchema,
  type UpdateBioImageAttributionInput,
} from '@/lib/validation/bio-image-input-schema';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Admin action: edit one bio image's attribution. The value is re-sanitized to
 * plain text before persisting. Uses the shared admin runner for the auth gate,
 * ObjectId validation, audit log, and revalidation.
 */
export const updateArtistBioImageAttributionAction = async (
  input: UpdateBioImageAttributionInput
): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: input.imageId,
    entityLabel: 'artist bio image',
    perform: async (id) => {
      const parsed = updateBioImageAttributionInputSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message };
      }
      const attribution =
        parsed.data.attribution === null ? null : sanitizeBioText(parsed.data.attribution);
      await ArtistService.updateBioImageAttribution(id, attribution);
      return { success: true };
    },
    event: 'media.artist_bio_image.updated',
    metadataKey: 'artistBioImageId',
    revalidate: ['/admin/artists'],
    failureError: 'Failed to update bio image attribution',
  });
