/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

/**
 * Invalidate specific paths in the CloudFront distribution.
 *
 * This is an escape hatch for cases where content-addressed keys cannot be used
 * (e.g. legal takedown of a specific audio file). Prefer uploading to a new S3 key
 * and updating the database reference instead.
 *
 * Cost: First 1,000 invalidation paths/month are free. After that, $0.005 per path.
 *
 * @param paths - Array of CloudFront paths to invalidate, e.g. ["/audio/ceschi/track123.mp3"]
 * @throws {Error} If CLOUDFRONT_DISTRIBUTION_ID is not configured or invalidation fails
 *
 * @example
 * ```ts
 * await invalidateCloudFrontPaths(["/audio/ceschi/track123.mp3"]);
 * ```
 */
export async function invalidateCloudFrontPaths(paths: string[]): Promise<void> {
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;

  if (!distributionId) {
    throw new Error('CLOUDFRONT_DISTRIBUTION_ID environment variable is not configured');
  }

  if (paths.length === 0) {
    throw new Error('At least one path is required for invalidation');
  }

  const client = new CloudFrontClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  await client.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `invalidation-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    })
  );
}
