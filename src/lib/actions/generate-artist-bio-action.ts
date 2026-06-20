/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { BioGenerationService } from '@/lib/services/bio-generation-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import {
  generateArtistBioInputSchema,
  type GenerateArtistBioActionResult,
} from '@/lib/validation/bio-generation-schema';
import { logSecurityEvent } from '@/utils/audit-log';

/**
 * Generates (or regenerates) an artist's short + long bio plus discovered
 * images and links. Admin-only. Delegates the read → generate → sanitize →
 * persist flow to {@link BioGenerationService.generateForArtist}; this action
 * only handles auth, input validation, audit logging, and cache revalidation.
 *
 * @param input - `{ artistId, links?, description? }`.
 * @returns The sanitized generated content for admin preview, or a typed error.
 */
export const generateArtistBioAction = async (
  input: unknown
): Promise<GenerateArtistBioActionResult> => {
  const session = await requireRole('admin');

  const parsed = generateArtistBioInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid bio generation request.' };
  }

  const result = await BioGenerationService.generateForArtist(parsed.data.artistId, {
    links: parsed.data.links,
    description: parsed.data.description,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  logSecurityEvent({
    event: 'media.artist.updated',
    userId: session.user.id,
    metadata: {
      artistId: parsed.data.artistId,
      action: 'bio-generated',
      model: result.data.model,
      imageCount: result.data.images.length,
      linkCount: result.data.links.length,
    },
  });

  revalidatePath('/admin/artists');
  revalidatePath('/artists');
  revalidatePath(`/artists/${result.slug}`);
  revalidatePath(`/artists/${result.slug}/bio`);

  return { success: true, data: result.data };
};
