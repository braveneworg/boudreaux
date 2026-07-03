/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

// Note: the public `/artists/[slug]/bio` page reflects deletions on its next
// revalidation/regeneration — the admin palette is kept live via TanStack
// invalidation (Task 5).

/** Deletes one discovered bio image (admin palette X), including best-effort
 *  CDN thumbnail cleanup via the service. */
export const deleteArtistBioImageAction = async (imageId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: imageId,
    entityLabel: 'artist bio image',
    perform: async (id) => {
      await ArtistService.deleteBioImage(id);
      return { success: true };
    },
    event: 'media.artist_bio_image.deleted',
    metadataKey: 'artistBioImageId',
    revalidate: ['/admin/artists'],
    failureError: 'Failed to delete bio image',
  });
