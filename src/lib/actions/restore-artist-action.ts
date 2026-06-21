/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';

import { runAdminEntityAction } from './run-admin-entity-action';

/**
 * Server action to restore a soft-deleted (archived) artist by clearing
 * `deletedOn`. Returns a plain result the {@link useRestoreArtistMutation} hook
 * maps to a toast.
 */
export const restoreArtistAction = async (
  artistId: string
): Promise<{ success: boolean; error?: string }> =>
  runAdminEntityAction({
    id: artistId,
    entityLabel: 'artist',
    perform: (id) => ArtistService.restoreArtist(id),
    event: 'media.artist.restored',
    metadataKey: 'artistId',
    revalidate: ['/admin/artists', '/artists'],
    failureError: 'Failed to restore artist',
  });
