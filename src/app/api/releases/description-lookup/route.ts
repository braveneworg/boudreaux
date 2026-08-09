/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { DESCRIPTION_LOOKUP_LIMIT, descriptionLookupLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ReleaseDescriptionLookupService } from '@/lib/services/release-description-lookup-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `"VINYL_12_INCH,DIGITAL"` → `['VINYL_12_INCH', 'DIGITAL']`; blanks dropped. */
const parseFormats = (raw: string | null): string[] =>
  raw
    ? raw
        .split(',')
        .map((format) => format.trim())
        .filter(Boolean)
    : [];

/** The label's authored notes arrive newline-delimited, one per paragraph. */
const parseLabelNotes = (raw: string | null): string[] =>
  raw
    ? raw
        .split(/\r?\n/)
        .map((note) => note.trim())
        .filter(Boolean)
    : [];

/** The optional release facts, already normalised for the service call. */
interface ReleaseContext {
  releasedOn?: string;
  catalogNumber?: string;
  formats?: string[];
  labelNotes?: string[];
}

/**
 * Reads the optional context params. A malformed date is dropped (the prose
 * simply goes undated) rather than failing a lookup the admin asked for.
 */
const readContext = (searchParams: URLSearchParams): ReleaseContext => {
  const releasedOn = searchParams.get('releasedOn')?.trim();
  const catalogNumber = searchParams.get('catalogNumber')?.trim();
  const formats = parseFormats(searchParams.get('formats'));
  const labelNotes = parseLabelNotes(searchParams.get('labelNotes'));

  return {
    ...(releasedOn && ISO_DATE_PATTERN.test(releasedOn) ? { releasedOn } : {}),
    ...(catalogNumber ? { catalogNumber } : {}),
    ...(formats.length > 0 ? { formats } : {}),
    ...(labelNotes.length > 0 ? { labelNotes } : {}),
  };
};

export const GET = withRateLimit(
  descriptionLookupLimiter,
  DESCRIPTION_LOOKUP_LIMIT
)(
  withAdmin(async (request: NextRequest): Promise<NextResponse> => {
    const { searchParams } = request.nextUrl;
    const title = searchParams.get('title')?.trim();
    const artist = searchParams.get('artist')?.trim();

    if (!title) {
      return NextResponse.json({ error: 'A non-empty title is required' }, { status: 400 });
    }
    if (!artist) {
      return NextResponse.json(
        { error: 'A non-empty artist is required — the blurb must name one' },
        { status: 400 }
      );
    }

    try {
      const result = await ReleaseDescriptionLookupService.lookup({
        title,
        artist,
        ...readContext(searchParams),
      });
      return NextResponse.json({ result }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      logger.error('Release description lookup route failed', { error });
      return NextResponse.json({ error: 'Release description lookup failed' }, { status: 502 });
    }
  })
);
