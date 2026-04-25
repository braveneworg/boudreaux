/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

import { prisma } from '../prisma';

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

  if (!OBJECT_ID_REGEX.test(featuredArtistId)) {
    return { success: false, error: 'Invalid featured artist ID' };
  }

  if (typeof coverArt !== 'string' || coverArt.trim().length === 0) {
    return { success: false, error: 'Cover art URL is required' };
  }

  // Reject data URIs at the boundary — they crush SSR HTML payload and were
  // the original source of the LCP regression on /.
  if (!/^https?:\/\//.test(coverArt)) {
    return { success: false, error: 'Cover art must be an HTTP(S) URL' };
  }

  try {
    await prisma.featuredArtist.update({
      where: { id: featuredArtistId },
      data: { coverArt },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to update cover art';
    return { success: false, error: errorMessage };
  }

  // The featured-artist carousel renders on the home page; no public detail
  // page for featured artists, so just refresh /.
  revalidatePath('/');

  return { success: true };
};
