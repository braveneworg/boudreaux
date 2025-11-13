import { NextResponse } from 'next/server';

import { CloudFrontClient, ListInvalidationsCommand } from '@aws-sdk/client-cloudfront';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;

    if (!distributionId) {
      return NextResponse.json({ status: 'unknown', message: 'CDN not configured' });
    }

    const client = new CloudFrontClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });

    const command = new ListInvalidationsCommand({
      DistributionId: distributionId,
      MaxItems: 5,
    });

    const response = await client.send(command);

    // Check if any invalidations are in progress
    const inProgressInvalidations =
      response.InvalidationList?.Items?.filter((inv) => inv.Status === 'InProgress') || [];

    if (inProgressInvalidations.length > 0) {
      const oldestInProgress = inProgressInvalidations[0];
      const createTime = oldestInProgress.CreateTime;
      const now = new Date();
      const minutesElapsed = createTime
        ? Math.floor((now.getTime() - createTime.getTime()) / 1000 / 60)
        : 0;
      const estimatedMinutesRemaining = Math.max(0, 15 - minutesElapsed);

      return NextResponse.json({
        status: 'invalidating',
        message: 'CDN cache is being updated',
        inProgress: inProgressInvalidations.length,
        estimatedMinutesRemaining,
        startedAt: createTime?.toISOString(),
      });
    }

    // Check for recently completed invalidations (within last 5 minutes)
    const recentlyCompleted =
      response.InvalidationList?.Items?.filter((inv) => {
        if (inv.Status !== 'Completed' || !inv.CreateTime) return false;
        const minutesSinceCompletion = Math.floor(
          (new Date().getTime() - inv.CreateTime.getTime()) / 1000 / 60
        );
        return minutesSinceCompletion < 5;
      }) || [];

    if (recentlyCompleted.length > 0) {
      return NextResponse.json({
        status: 'ready',
        message: 'CDN cache recently updated - you may need to refresh your browser',
        completedAt: recentlyCompleted[0].CreateTime?.toISOString(),
      });
    }

    return NextResponse.json({
      status: 'ready',
      message: 'CDN is ready',
    });
  } catch (error) {
    console.error('Error checking CDN status:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Unable to check CDN status',
      },
      { status: 500 }
    );
  }
}
