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
import {
  addImageSourceLinkInputSchema,
  type ImageSourceLink,
  MAX_IMAGE_LINKS,
} from '@/lib/validation/image-links-schema';

/** Result of flagging one URL as an artist image source. */
export interface AddImageSourceLinkActionResult {
  success: boolean;
  data?: ImageSourceLink;
  error?: string;
}

/**
 * Admin action: store one page URL as an image source for the artist — a page
 * the images-from-links job reads for photos. The row is `origin: 'custom'`
 * (survives regeneration) and image-source only unless the same URL already
 * exists as a reference link, in which case it simply gains the role.
 */
export const addArtistImageSourceLinkAction = async (
  input: unknown
): Promise<AddImageSourceLinkActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = addImageSourceLinkInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const result = await ImageLinksService.addSourceLink(parsed.data.artistId, parsed.data.url);
    if (result.status === 'not-found') {
      return { success: false, error: 'Artist not found' };
    }
    if (result.status === 'limit') {
      return { success: false, error: `Up to ${MAX_IMAGE_LINKS} image sources per artist` };
    }
    const { link } = result;

    logSecurityEvent({
      event: 'media.artist_bio_link.created',
      userId: session.user.id,
      metadata: { artistId: parsed.data.artistId, artistBioLinkId: link.id, role: 'imageSource' },
    });

    revalidatePath('/admin/artists');

    return { success: true, data: link };
  } catch (error) {
    loggers.media.error('Add artist image source link action error', error);
    return { success: false, error: 'Failed to add link' };
  }
};
