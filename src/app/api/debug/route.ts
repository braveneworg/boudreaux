import { NextResponse } from 'next/server';

import { auth } from '../../../../auth';

/**
 * Debug endpoint to check environment variable configuration.
 * SECURITY: Requires admin authentication - never expose env details to unauthenticated users.
 * Only returns boolean presence indicators, never actual values.
 */
export async function GET() {
  // Require admin authentication for debug endpoints
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Only return presence indicators, never actual values
  return NextResponse.json({
    hasS3Bucket: !!process.env.S3_BUCKET,
    hasAwsRegion: !!process.env.AWS_REGION,
    hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasAwsSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    hasCdnDomain: !!process.env.CDN_DOMAIN,
  });
}
