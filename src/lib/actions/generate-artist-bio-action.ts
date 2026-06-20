/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { BioGenerationService } from '@/lib/services/bio-generation-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import {
  generateArtistBioInputSchema,
  type GenerateArtistBioActionResult,
} from '@/lib/validation/bio-generation-schema';
import { logSecurityEvent } from '@/utils/audit-log';

const logger = loggers.media;

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

  // Wrap the read → generate → persist flow so an unexpected throw (e.g. a
  // Prisma/Mongo error from the artist lookup, or any other failure the service
  // doesn't convert to a typed result) surfaces as a graceful error toast
  // instead of an unhandled Server Action rejection — which Next renders as an
  // opaque 500 ("digest" error) in production. Auth (`requireRole`) stays
  // outside: an unauthorized caller should still propagate, matching the other
  // admin actions.
  try {
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
  } catch (error) {
    // Once caught, Next no longer logs this server-side, so log it here to keep
    // the failure observable (this opacity is exactly what made the original
    // production 500 hard to diagnose).
    logger.error('Unexpected error generating artist bio', {
      artistId: parsed.data.artistId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Bio generation failed unexpectedly. Please try again.' };
  }
};
