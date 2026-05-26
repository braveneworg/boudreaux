/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';

/**
 * Debug endpoint to check environment variable configuration.
 * SECURITY: Requires admin authentication - never expose env details to unauthenticated users.
 * Only returns boolean presence indicators, never actual values.
 */
export const GET = withAdmin(async () => {
  // Debug endpoints are disabled in production
  /* v8 ignore next 3 -- vitest config replaces `process.env.NODE_ENV` with `'test'` at compile time, so the production branch is dead-code-eliminated and not reachable from tests */
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only return presence indicators, never actual values
  return NextResponse.json({
    hasS3Bucket: !!process.env.S3_BUCKET,
    hasAwsRegion: !!process.env.AWS_REGION,
    hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasAwsSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    hasCdnDomain: !!process.env.CDN_DOMAIN,
  });
});
