/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import {
  CloudFrontClient,
  type InvalidationSummary,
  ListInvalidationsCommand,
} from '@aws-sdk/client-cloudfront';

import { withAdmin } from '@/lib/decorators/with-auth';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/** Whole minutes elapsed between `from` and now. */
const minutesSince = (from: Date): number =>
  Math.floor((new Date().getTime() - from.getTime()) / 1000 / 60);

/** True for a `Completed` invalidation finished within the last 5 minutes. */
const isRecentlyCompleted = (inv: InvalidationSummary): boolean =>
  inv.Status === 'Completed' && !!inv.CreateTime && minutesSince(inv.CreateTime) < 5;

/** Build the `invalidating` payload for the oldest in-progress invalidation. */
const buildInvalidatingResponse = (inProgress: InvalidationSummary[]): NextResponse => {
  const createTime = inProgress[0].CreateTime;
  const minutesElapsed = createTime ? minutesSince(createTime) : 0;
  const estimatedMinutesRemaining = Math.max(0, 15 - minutesElapsed);

  return NextResponse.json({
    status: 'invalidating',
    message: 'CDN cache is being updated',
    inProgress: inProgress.length,
    estimatedMinutesRemaining,
    startedAt: createTime?.toISOString(),
  });
};

/** Build the status payload from the invalidation list of a successful API call. */
const buildStatusResponse = (items: InvalidationSummary[] | undefined): NextResponse => {
  // Check if any invalidations are in progress
  const inProgressInvalidations = items?.filter((inv) => inv.Status === 'InProgress') || [];
  if (inProgressInvalidations.length > 0) {
    return buildInvalidatingResponse(inProgressInvalidations);
  }

  // Check for recently completed invalidations (within last 5 minutes)
  const recentlyCompleted = items?.filter(isRecentlyCompleted) || [];
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
};

export const GET = withAdmin(async () => {
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

    return buildStatusResponse(response.InvalidationList?.Items);
  } catch (error) {
    loggers.s3.error('Error checking CDN status', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Unable to check CDN status',
      },
      { status: 500 }
    );
  }
});
