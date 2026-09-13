/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { HEALTH_LIMIT, healthLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { checkDatabaseHealth } from '@/lib/utils/database-utils';
import { loggers } from '@/lib/utils/logger';
import { checkRedisHealth, type RedisHealthResult } from '@/lib/utils/redis-health';

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

/**
 * Redis is reported but never decides the status code: it only backs
 * rate limits and mention emails, and both fail open without it.
 */
const redisFields = ({
  status,
  latency,
}: RedisHealthResult): { redis: RedisHealthResult['status']; redisLatency?: number } => ({
  redis: status,
  ...(latency !== undefined && { redisLatency: latency }),
});

export const GET = withRateLimit(
  healthLimiter,
  HEALTH_LIMIT
)(async () => {
  try {
    const [dbHealth, redisHealth] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

    if (!dbHealth.healthy) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          database: 'connection failed',
          ...redisFields(redisHealth),
          timestamp: new Date().toISOString(),
          // Only include error details in development
          ...(process.env.NODE_ENV === 'development' && {
            error: dbHealth.error,
          }),
        },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        status: 'healthy',
        database: 'connected',
        latency: dbHealth.latency,
        ...redisFields(redisHealth),
        timestamp: new Date().toISOString(),
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    loggers.database.error('Health check error', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        database: 'health check failed',
        timestamp: new Date().toISOString(),
        // Only include error details in development
        ...(process.env.NODE_ENV === 'development' && {
          error: error instanceof Error ? error.message : 'Unspecified error occurred',
        }),
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
});
