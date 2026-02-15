/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { AudioMetadataService } from '@/lib/services/audio-metadata-service';

export const dynamic = 'force-dynamic';

// Configure request timeout for metadata extraction (body size limit is set in nginx.conf, currently 500MB)
export const maxDuration = 60; // 60 seconds timeout for large file processing

/**
 * POST /api/tracks/metadata
 * Extract metadata from an uploaded audio file
 * Expects multipart/form-data with 'file' field
 */
export const POST = await withAdmin(async (request: NextRequest) => {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type must be multipart/form-data' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const validAudioTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/aiff',
      'audio/x-aiff',
      'audio/flac',
      'audio/x-flac',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4',
      'video/mp4', // MP4 can contain audio
    ];

    if (!validAudioTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Supported types: MP3, WAV, FLAC, AAC, OGG, M4A`,
        },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract metadata
    const result = await AudioMetadataService.extractMetadata(buffer, file.type, file.name);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      metadata: result.data,
    });
  } catch (error) {
    console.error('Track metadata extraction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
