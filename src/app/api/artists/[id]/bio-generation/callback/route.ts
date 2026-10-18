/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidateArtistBioPaths } from '@/lib/actions/generate-artist-bio-action-helpers';
import { BIO_CALLBACK_LIMIT, bioCallbackLimiter } from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { bioGenerationJob } from '@/lib/services/bio-generation-service';
import { bioGenerationCallbackSchema } from '@/lib/validation/bio-generation-schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/artists/[id]/bio-generation/callback
 * The out-of-band completion endpoint the bio-generator Lambda POSTs its result
 * to. A won claim persists the bio post-response, then revalidates the
 * artist's pages.
 */
export const POST = signedCallbackRoute({
  job: bioGenerationJob,
  channel: 'callback',
  // Room for up to ~100 re-hostable image rows plus the three bios.
  maxBodyBytes: 512 * 1024,
  schema: bioGenerationCallbackSchema,
  limiter: bioCallbackLimiter,
  limit: BIO_CALLBACK_LIMIT,
  onComplete: ({ slug }) => revalidateArtistBioPaths(slug),
});
