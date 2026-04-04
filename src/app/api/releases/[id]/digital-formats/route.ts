/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { type DigitalFormatType, VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';

/** Convert BigInt values to Number so NextResponse.json() can serialize them. */
function serializeBigInts<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_key, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

/**
 * GET /api/releases/[id]/digital-formats
 * GET /api/releases/[id]/digital-formats?formatType=MP3_320KBPS
 *
 * Without formatType: returns all active digital formats with downloadable files.
 * With formatType: looks up a single format (with child files) for a given release.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: releaseId } = await context.params;
    const formatType = request.nextUrl.searchParams.get('formatType');
    const repo = new ReleaseDigitalFormatRepository();

    // When no formatType is provided, return all available formats
    if (!formatType) {
      const allFormats = await repo.findAllByRelease(releaseId);
      const formats = allFormats
        .filter((f) => f.files.length > 0 || f.fileName !== null)
        .map((f) => ({
          formatType: f.formatType as DigitalFormatType,
          fileName: f.fileName ?? f.files[0]?.fileName ?? `${f.formatType}.zip`,
        }));

      return NextResponse.json({ formats });
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

    return NextResponse.json({ digitalFormat: serializeBigInts(format) });
  } catch (error) {
    console.error('Digital formats GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
