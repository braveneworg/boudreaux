import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasS3Bucket: !!process.env.S3_BUCKET,
    s3BucketValue: process.env.S3_BUCKET || 'NOT SET',
    hasAwsRegion: !!process.env.AWS_REGION,
    hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasAwsSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    hasCdnDomain: !!process.env.CDN_DOMAIN,
  });
}
