/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/utils/auth/require-role';
import { cache } from '@/lib/utils/simple-cache';
import { updateFeaturedArtistCoverArtSchema } from '@/lib/validation/admin-asset-schemas';

export interface UpdateFeaturedArtistCoverArtResult {
  success: boolean;
  error?: string;
}

/**
 * Persist a new cover-art CDN URL on a FeaturedArtist row immediately, without
 * requiring a full featured-artist-form submission. Mirrors
 * `updateReleaseCoverArtAction` so admin uploads through `CoverArtField` get
 * the same behavior on both forms: variants generated, orphans swept,
 * CloudFront invalidated, DB written.
 */
export const updateFeaturedArtistCoverArtAction = async (
  featuredArtistId: string,
  coverArt: string
): Promise<UpdateFeaturedArtistCoverArtResult> => {
  await requireRole('admin');

  const parsed = updateFeaturedArtistCoverArtSchema.safeParse({ featuredArtistId, coverArt });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    await prisma.featuredArtist.update({
      where: { id: parsed.data.featuredArtistId },
      data: { coverArt: parsed.data.coverArt },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to update cover art';
    return { success: false, error: errorMessage };
  }

  // The featured-artist carousel renders on the home page; no public detail
  // page for featured artists. Clear the cached carousel and refresh /.
  cache.deleteByPrefix('featured-artists:');
  revalidatePath('/');

  return { success: true };
};
