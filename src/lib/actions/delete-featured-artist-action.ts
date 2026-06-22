/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server action to hard-delete a featured artist. The `FeaturedArtist` model has
 * no `deletedOn` field, so this removes the record permanently. Returns a plain
 * result the {@link useDeleteFeaturedArtistMutation} hook maps to a toast.
 */
export const deleteFeaturedArtistAction = async (
  featuredArtistId: string
): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: featuredArtistId,
    entityLabel: 'featured artist',
    perform: (id) => FeaturedArtistsService.hardDeleteFeaturedArtist(id),
    event: 'media.featured_artist.deleted',
    metadataKey: 'featuredArtistId',
    revalidate: ['/admin/featured-artists', '/'],
    failureError: 'Failed to delete featured artist',
  });
