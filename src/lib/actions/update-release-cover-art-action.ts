/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/utils/auth/require-role';
import { updateReleaseCoverArtSchema } from '@/lib/validation/admin-asset-schemas';

export interface UpdateReleaseCoverArtResult {
  success: boolean;
  error?: string;
}

/**
 * Persist a new cover-art CDN URL on a Release row immediately, without
 * requiring a full release-form submission. Called from `CoverArtField`
 * after S3 upload + variant generation complete, so the admin can navigate
 * away mid-edit without losing the cover.
 *
 * Revalidates the home page and the public release page so the new cover is
 * visible to viewers right away. Does NOT revalidate the admin edit page —
 * that page's React state is the source of truth for the in-flight form.
 */
export const updateReleaseCoverArtAction = async (
  releaseId: string,
  coverArt: string
): Promise<UpdateReleaseCoverArtResult> => {
  await requireRole('admin');

  const parsed = updateReleaseCoverArtSchema.safeParse({ releaseId, coverArt });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    await prisma.release.update({
      where: { id: parsed.data.releaseId },
      data: { coverArt: parsed.data.coverArt },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to update cover art';
    return { success: false, error: errorMessage };
  }

  revalidatePath('/');
  revalidatePath(`/releases/${releaseId}`);

  return { success: true };
};
