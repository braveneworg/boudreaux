import { NextResponse } from 'next/server';

import { checkDatabaseHealth } from '@/app/lib/utils/database-utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const dbHealth = await checkDatabaseHealth();

    if (!dbHealth.healthy) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          database: 'connection failed',
          timestamp: new Date().toISOString(),
          // Only include error details in development
          ...(process.env.NODE_ENV === 'development' && {
            error: dbHealth.error,
          }),
        },
        {
          status: 500,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }

    return NextResponse.json(
      {
        status: 'healthy',
        database: 'connected',
        latency: dbHealth.latency,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error) {
    console.error('Health check error:', error);
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
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }
}
