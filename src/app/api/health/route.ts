import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/app/lib/utils/database-utils';

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
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      latency: dbHealth.latency,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        database: 'health check failed',
        timestamp: new Date().toISOString(),
        // Only include error details in development
        ...(process.env.NODE_ENV === 'development' && {
          error: 'Unspecified error occurred',
        }),
      },
      { status: 500 }
    );
  }
}
