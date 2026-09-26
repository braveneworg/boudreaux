/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ImageLinksService } from '@/lib/services/image-links-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { removeImageSourceLinkInputSchema } from '@/lib/validation/image-links-schema';

/** Result of dropping the image-source role from one of the artist's links. */
export interface RemoveImageSourceLinkActionResult {
  success: boolean;
  error?: string;
}

/**
 * Admin action: remove a link from the artist's image sources. An image-only
 * row is deleted; a row that is also a reference link only loses the role.
 */
export const removeArtistImageSourceLinkAction = async (
  input: unknown
): Promise<RemoveImageSourceLinkActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = removeImageSourceLinkInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const removed = await ImageLinksService.removeSourceLink(
      parsed.data.artistId,
      parsed.data.linkId
    );
    if (!removed) {
      return { success: false, error: 'Link not found' };
    }

    logSecurityEvent({
      event: 'media.artist_bio_link.deleted',
      userId: session.user.id,
      metadata: {
        artistId: parsed.data.artistId,
        artistBioLinkId: parsed.data.linkId,
        role: 'imageSource',
      },
    });

    revalidatePath('/admin/artists');

    return { success: true };
  } catch (error) {
    loggers.media.error('Remove artist image source link action error', error);
    return { success: false, error: 'Failed to remove link' };
  }
};
