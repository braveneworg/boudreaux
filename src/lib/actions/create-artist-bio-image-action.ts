/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
import {
  createBioImageInputSchema,
  type CreateBioImageInput,
} from '@/lib/validation/bio-image-input-schema';

/** Result of adding one bio image. */
export interface CreateBioImageActionResult {
  success: boolean;
  data?: ArtistBioImageRecord;
  error?: string;
}

/**
 * Admin action: persist one manually-added bio image (attribution required) so
 * it appears in the discovered-images palette. Variant generation is triggered
 * separately by the upload orchestration (PR 1b).
 */
export const createArtistBioImageAction = async (
  input: CreateBioImageInput
): Promise<CreateBioImageActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = createBioImageInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    if (!(await ArtistService.existsById(parsed.data.artistId))) {
      return { success: false, error: 'Artist not found' };
    }

    const { attribution, title, alt } = parsed.data;
    const created = await ArtistService.createBioImage({
      ...parsed.data,
      // Manually-uploaded media is custom, so regeneration preserves it.
      origin: 'custom',
      attribution: sanitizeBioText(attribution),
      title: title == null ? title : sanitizeBioText(title),
      alt: alt == null ? alt : sanitizeBioText(alt),
    });

    logSecurityEvent({
      event: 'media.artist_bio_image.created',
      userId: session.user.id,
      metadata: { artistId: parsed.data.artistId, artistBioImageId: created.id },
    });

    revalidatePath('/admin/artists');

    return { success: true, data: created };
  } catch (error) {
    loggers.s3.error('Create artist bio image action error', error);
    return { success: false, error: 'Failed to add bio image' };
  }
};
