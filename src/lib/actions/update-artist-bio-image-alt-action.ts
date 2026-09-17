/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';
import { sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
import {
  updateBioImageAltInputSchema,
  type UpdateBioImageAltInput,
} from '@/lib/validation/bio-image-input-schema';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Admin action: edit one bio image's alt text — the accessible description a
 * display image needs before it can be chosen. Re-sanitized to plain text
 * before persisting. Uses the shared admin runner for the auth gate, ObjectId
 * validation, audit log, and revalidation.
 */
export const updateArtistBioImageAltAction = async (
  input: UpdateBioImageAltInput
): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: input.imageId,
    entityLabel: 'artist bio image',
    perform: async (id) => {
      const parsed = updateBioImageAltInputSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message };
      }
      const alt = parsed.data.alt === null ? null : sanitizeBioText(parsed.data.alt);
      await ArtistService.updateBioImageAlt(id, alt);
      return { success: true };
    },
    event: 'media.artist_bio_image.updated',
    metadataKey: 'artistBioImageId',
    revalidate: ['/admin/artists'],
    failureError: 'Failed to update bio image alt text',
  });
