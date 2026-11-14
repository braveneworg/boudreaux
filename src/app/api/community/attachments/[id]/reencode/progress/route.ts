/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { REENCODE_PROGRESS_LIMIT, reencodeProgressLimiter } from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { submissionReencodeJob } from '@/lib/services/submission-attachment-service';
import { submissionReencodeProgressPostSchema } from '@/lib/validation/submission-attachment-schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/community/attachments/[id]/reencode/progress
 * The out-of-band channel the re-encode Lambda POSTs its checkpoints to. It
 * verifies the per-job token but never claims it.
 */
export const POST = signedCallbackRoute({
  job: submissionReencodeJob,
  channel: 'progress',
  // A checkpoint is a stage and a percentage.
  maxBodyBytes: 2 * 1024,
  schema: submissionReencodeProgressPostSchema,
  limiter: reencodeProgressLimiter,
  limit: REENCODE_PROGRESS_LIMIT,
});
