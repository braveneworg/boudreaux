/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';

import { runAdminEntityAction } from './run-admin-entity-action';

/**
 * Server action to publish an artist (stamps `publishedOn`). Returns a plain
 * result the {@link usePublishArtistMutation} hook maps to a toast.
 */
export const publishArtistAction = async (
  artistId: string
): Promise<{ success: boolean; error?: string }> =>
  runAdminEntityAction({
    id: artistId,
    entityLabel: 'artist',
    perform: (id) => ArtistService.publishArtist(id),
    event: 'media.artist.published',
    metadataKey: 'artistId',
    revalidate: ['/admin/artists', '/artists'],
    failureError: 'Failed to publish artist',
  });
