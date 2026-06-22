/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server action to soft-delete (archive) an artist. The `Artist` model has a
 * `deletedOn` field, so the record is retained and excluded from default
 * listings rather than removed. Returns a plain result the
 * {@link useArchiveArtistMutation} hook maps to a toast.
 */
export const archiveArtistAction = async (artistId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: artistId,
    entityLabel: 'artist',
    perform: (id) => ArtistService.archiveArtist(id),
    event: 'media.artist.archived',
    metadataKey: 'artistId',
    revalidate: ['/admin/artists', '/artists'],
    failureError: 'Failed to archive artist',
  });
