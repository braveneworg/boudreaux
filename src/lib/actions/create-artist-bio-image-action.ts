/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ArtistService } from '@/lib/services/artist-service';
import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';
import { logSecurityEvent } from '@/lib/utils/audit-log';
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
 *
 * The alt text goes to the service as typed: it defaults to the artist's
 * display name when the admin leaves it blank (`ArtistService.createBioImage`),
 * and the admin can still refine it from the palette afterwards.
 */
export const createArtistBioImageAction = async (
  input: CreateBioImageInput
): Promise<CreateBioImageActionResult> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }
  const { session } = gate;

  const parsed = createBioImageInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const { attribution, title } = parsed.data;
    const created = await ArtistService.createBioImage({
      ...parsed.data,
      // Manually-uploaded media is custom, so regeneration preserves it.
      origin: 'custom',
      attribution: sanitizeBioText(attribution),
      title: title == null ? title : sanitizeBioText(title),
    });
    if (!created.success) {
      return { success: false, error: created.error };
    }

    logSecurityEvent({
      event: 'media.artist_bio_image.created',
      userId: session.user.id,
      metadata: { artistId: parsed.data.artistId, artistBioImageId: created.data.id },
    });

    revalidatePath('/admin/artists');

    return { success: true, data: created.data };
  } catch (error) {
    loggers.s3.error('Create artist bio image action error', error);
    return { success: false, error: 'Failed to add bio image' };
  }
};
