/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { type DigitalFormatType, VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { stripInlineImageDataUris } from '@/lib/utils/sanitize-response';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

/**
 * Convert BigInt → Number for JSON serialization, and strip legacy inline
 * `data:` URI blobs to keep the response payload small (see sanitize-response.ts).
 */
function serializeForResponse<T>(data: T): T {
  const noBigInts: T = JSON.parse(
    JSON.stringify(data, (_key, v) => (typeof v === 'bigint' ? Number(v) : v))
  );
  return stripInlineImageDataUris(noBigInts);
}

/**
 * GET /api/releases/[id]/digital-formats
 * GET /api/releases/[id]/digital-formats?formatType=MP3_320KBPS
 *
 * Without formatType: returns all active digital formats with downloadable files.
 * With formatType: looks up a single format (with child files) for a given release.
 */
export const GET = withRateLimit<{ id: string }>(
  publicLimiter,
  PUBLIC_LIMIT
)(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    const { id: releaseId } = await context.params;

    if (!isValidObjectId(releaseId)) {
      return NextResponse.json({ error: 'Invalid release ID' }, { status: 400 });
    }

    const formatType = request.nextUrl.searchParams.get('formatType');
    const repo = new ReleaseDigitalFormatRepository();

    // When no formatType is provided, return all available formats
    if (!formatType) {
      const allFormats = await repo.findAllByRelease(releaseId);
      const formats = allFormats
        .filter(
          (f) =>
            f.files.length > 0 || (typeof f.s3Key === 'string' && typeof f.fileName === 'string')
        )
        .map((f) => ({
          formatType: f.formatType as DigitalFormatType,
          fileName: f.fileName ?? f.files[0]?.fileName ?? `${f.formatType}.zip`,
        }));

      return NextResponse.json(
        { formats },
        {
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
        }
      );
    }

    // Single-format lookup (existing behavior)
    if (!VALID_FORMAT_TYPES.includes(formatType as DigitalFormatType)) {
      return NextResponse.json({ error: 'Invalid formatType query parameter.' }, { status: 400 });
    }

    const format = await repo.findByReleaseAndFormat(releaseId, formatType as DigitalFormatType);

    if (!format) {
      return NextResponse.json(
        { error: `No ${formatType} format found for this release.` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { digitalFormat: serializeForResponse(format) },
      {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      }
    );
  } catch (error) {
    console.error('Digital formats GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
