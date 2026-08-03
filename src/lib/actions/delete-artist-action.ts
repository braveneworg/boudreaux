/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server action to hard-delete an artist. `ArtistService.deleteArtist` runs
 * the repository cascade (join rows, gallery images/urls, then the artist row
 * in one transaction) and best-effort deletes the gallery images from S3.
 * Distinct from {@link archiveArtistAction}, the soft delete the admin list
 * offers on active rows. Returns a plain result the
 * {@link useDeleteArtistMutation} hook maps to a toast.
 */
export const deleteArtistAction = async (artistId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: artistId,
    entityLabel: 'artist',
    perform: (id) => ArtistService.deleteArtist(id),
    event: 'media.artist.deleted',
    metadataKey: 'artistId',
    revalidate: ['/admin/artists', '/artists'],
    failureError: 'Failed to delete artist',
  });
