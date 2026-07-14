/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { isInvalidS3Key } from '@/lib/actions/confirm-upload-action-helpers';
import { VIDEO_PROBE_PREFILL_LIMIT, videoProbePrefillLimiter } from '@/lib/config/rate-limit-tiers';
import { VIDEO_KEY_PREFIX } from '@/lib/constants/video-uploads';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

/** Validated params extracted from the request query string. */
interface ProbeParams {
  videoId: string;
  s3Key: string;
}

/** Validate `videoId` and `s3Key` query params; returns params or a 400 response. */
const validateParams = (request: NextRequest): ProbeParams | NextResponse => {
  const { searchParams } = request.nextUrl;
  const videoId = searchParams.get('videoId');
  const s3Key = searchParams.get('s3Key');

  if (!videoId || !isValidObjectId(videoId)) {
    return NextResponse.json({ error: 'Invalid or missing videoId parameter' }, { status: 400 });
  }

  if (!s3Key || isInvalidS3Key(s3Key, `${VIDEO_KEY_PREFIX}${videoId}/`)) {
    return NextResponse.json({ error: 'Invalid or missing s3Key parameter' }, { status: 400 });
  }

  return { videoId, s3Key };
};

export const GET = withRateLimit(
  videoProbePrefillLimiter,
  VIDEO_PROBE_PREFILL_LIMIT
)(
  withAdmin(async (request: NextRequest): Promise<NextResponse> => {
    const validated = validateParams(request);
    if (validated instanceof NextResponse) {
      return validated;
    }

    const { s3Key } = validated;

    try {
      const result = await VideoProbeService.probeForPrefill(s3Key);
      return NextResponse.json(result);
    } catch (error) {
      logger.error('Unexpected error in probe-metadata route', { error });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  })
);
