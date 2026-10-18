/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidateArtistBioPaths } from '@/lib/actions/generate-artist-bio-action-helpers';
import { BIO_CALLBACK_LIMIT, bioCallbackLimiter } from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { imageLinksJob } from '@/lib/services/image-links-service';
import { imageLinksCallbackSchema } from '@/lib/validation/image-links-schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/artists/[id]/image-links/callback
 * The out-of-band completion endpoint the bio-generator Lambda POSTs an
 * images-from-links result to. A won claim re-hosts and persists the photos
 * post-response, then revalidates the artist's pages.
 */
export const POST = signedCallbackRoute({
  job: imageLinksJob,
  channel: 'callback',
  // Room for up to ~100 re-hostable image rows.
  maxBodyBytes: 512 * 1024,
  schema: imageLinksCallbackSchema,
  limiter: bioCallbackLimiter,
  limit: BIO_CALLBACK_LIMIT,
  onComplete: ({ slug }) => revalidateArtistBioPaths(slug),
});
