/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { REENCODE_CALLBACK_LIMIT, reencodeCallbackLimiter } from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { submissionReencodeJob } from '@/lib/services/submission-attachment-service';
import { submissionReencodeCallbackSchema } from '@/lib/validation/submission-attachment-schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/community/attachments/[id]/reencode/callback
 * The out-of-band completion endpoint the re-encode Lambda POSTs its result
 * to (ADR-0026). A won claim stores what was written post-response. No cache
 * revalidation: the form and the review page poll the attachments list.
 */
export const POST = signedCallbackRoute({
  job: submissionReencodeJob,
  channel: 'callback',
  // A result is three keys and five numbers, or one failure code.
  maxBodyBytes: 16 * 1024,
  schema: submissionReencodeCallbackSchema,
  limiter: reencodeCallbackLimiter,
  limit: REENCODE_CALLBACK_LIMIT,
});
