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

/** Deletes one discovered bio link (admin palette X). */
export const deleteArtistBioLinkAction = async (linkId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: linkId,
    entityLabel: 'artist bio link',
    perform: async (id) => {
      await ArtistService.deleteBioLink(id);
      return { success: true };
    },
    event: 'media.artist_bio_link.deleted',
    metadataKey: 'artistBioLinkId',
    revalidate: ['/admin/artists'],
    failureError: 'Failed to delete bio link',
  });
