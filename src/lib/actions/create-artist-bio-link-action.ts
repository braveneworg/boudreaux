/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import type { ArtistBioLinkRecord } from '@/lib/types/domain/artist';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { sanitizeUrl } from '@/lib/utils/sanitization';
import { sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
import {
  createBioLinkInputSchema,
  type CreateBioLinkInput,
} from '@/lib/validation/bio-link-input-schema';

/** Result of adding one custom bio link. */
export interface CreateBioLinkActionResult {
  success: boolean;
  data?: ArtistBioLinkRecord;
  error?: string;
}

/**
 * Admin action: persist one manually-authored bio link (label + URL + optional
 * kind) stamped `origin: 'custom'` so it survives regeneration and appears in
 * the discovered-links palette.
 */
export const createArtistBioLinkAction = async (
  input: CreateBioLinkInput
): Promise<CreateBioLinkActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = createBioLinkInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    if (!(await ArtistService.existsById(parsed.data.artistId))) {
      return { success: false, error: 'Artist not found' };
    }

    const { label, url } = parsed.data;
    const created = await ArtistService.createBioLink({
      ...parsed.data,
      // Admin-authored links are custom, so regeneration preserves them.
      origin: 'custom',
      label: sanitizeBioText(label),
      url: sanitizeUrl(url),
    });

    logSecurityEvent({
      event: 'media.artist_bio_link.created',
      userId: session.user.id,
      metadata: { artistId: parsed.data.artistId, artistBioLinkId: created.id },
    });

    revalidatePath('/admin/artists');

    return { success: true, data: created };
  } catch (error) {
    loggers.media.error('Create artist bio link action error', error);
    return { success: false, error: 'Failed to add bio link' };
  }
};
