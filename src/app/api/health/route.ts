import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

export async function GET() {
  try {
    // Check if mongoose is already connected
    if (mongoose.connection.readyState === 1) {
      return NextResponse.json({
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    }

    // If not connected, attempt to connect
    if (!process.env.MONGODB_URI) {
      return NextResponse.json({
        status: 'unhealthy',
        database: 'no connection string',
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    await mongoose.connect(process.env.MONGODB_URI);

    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Database connection error:', error);
    return NextResponse.json({
      status: 'unhealthy',
      database: 'connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
