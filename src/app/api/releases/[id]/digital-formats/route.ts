/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { type DigitalFormatType, VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';

/**
 * GET /api/releases/[id]/digital-formats?formatType=MP3_320KBPS
 *
 * Lookup a digital format (with child files) for a given release and format type.
 * Used by the admin FeaturedArtist form to validate MP3_320KBPS availability
 * and auto-populate the digitalFormatId.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: releaseId } = await context.params;
    const formatType = request.nextUrl.searchParams.get('formatType');

    if (!formatType || !VALID_FORMAT_TYPES.includes(formatType as DigitalFormatType)) {
      return NextResponse.json(
        { error: 'Invalid or missing formatType query parameter.' },
        { status: 400 }
      );
    }

    const repo = new ReleaseDigitalFormatRepository();
    const format = await repo.findByReleaseAndFormat(releaseId, formatType as DigitalFormatType);

    if (!format) {
      return NextResponse.json(
        { error: `No ${formatType} format found for this release.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ digitalFormat: format });
  } catch (error) {
    console.error('Digital formats GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
