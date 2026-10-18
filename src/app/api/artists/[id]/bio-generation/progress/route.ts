/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BIO_PROGRESS_LIMIT, bioProgressLimiter } from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { bioGenerationJob } from '@/lib/services/bio-generation-service';
import { bioProgressPostSchema } from '@/lib/validation/bio-generation-schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/artists/[id]/bio-generation/progress
 * The out-of-band channel the bio-generator Lambda POSTs per-stage progress
 * checkpoints to. It verifies the per-job token but never claims it.
 */
export const POST = signedCallbackRoute({
  job: bioGenerationJob,
  channel: 'progress',
  // A checkpoint is a stage + short detail + a small counts map — kilobytes at most.
  maxBodyBytes: 4 * 1024,
  schema: bioProgressPostSchema,
  limiter: bioProgressLimiter,
  limit: BIO_PROGRESS_LIMIT,
});
