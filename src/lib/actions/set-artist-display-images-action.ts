/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import {
  setDisplayImagesInputSchema,
  type SetDisplayImagesInput,
} from '@/lib/validation/bio-image-input-schema';

/** Result of replacing an artist's display images. */
export interface SetDisplayImagesActionResult {
  success: boolean;
  error?: string;
  /** The service's stable failure code, so the client can branch on it. */
  code?: DataErrorCode;
}

/**
 * Admin action: replace an artist's display images with the given bio image
 * ids, in display order. One set-style write rather than per-row toggles: the
 * cap, uniqueness, ownership, and alt-text rules are properties of the set,
 * so the service checks them atomically and a reorder is a single round-trip.
 * Revalidates the admin list, the public index, and the artist's page.
 */
export const setArtistDisplayImagesAction = async (
  input: SetDisplayImagesInput
): Promise<SetDisplayImagesActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = setDisplayImagesInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { artistId, imageIds } = parsed.data;

  try {
    const result = await ArtistService.setDisplayImages(artistId, imageIds);
    if (!result.success) {
      return { success: false, error: result.error, code: result.code };
    }

    logSecurityEvent({
      event: 'media.artist_display_images.updated',
      userId: session.user.id,
      metadata: { artistId, artistBioImageIds: imageIds },
    });

    revalidatePath('/admin/artists');
    revalidatePath('/artists');
    revalidatePath(`/artists/${result.data.slug}`);

    return { success: true };
  } catch (error) {
    loggers.media.error('Set artist display images action error', error);
    return { success: false, error: 'Failed to update display images' };
  }
};
