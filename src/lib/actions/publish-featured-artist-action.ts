/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

import { runAdminEntityAction } from './run-admin-entity-action';

/**
 * Server action to publish a single featured artist (stamps `publishedOn`).
 * Distinct from `publishFeaturedArtistsToSiteAction`, which republishes the whole
 * active set. Returns a plain result the {@link usePublishFeaturedArtistMutation}
 * hook maps to a toast.
 */
export const publishFeaturedArtistAction = async (
  featuredArtistId: string
): Promise<{ success: boolean; error?: string }> =>
  runAdminEntityAction({
    id: featuredArtistId,
    entityLabel: 'featured artist',
    perform: (id) => FeaturedArtistsService.publishFeaturedArtist(id),
    event: 'media.featured_artist.published',
    metadataKey: 'featuredArtistId',
    revalidate: ['/admin/featured-artists', '/'],
    failureError: 'Failed to publish featured artist',
  });
