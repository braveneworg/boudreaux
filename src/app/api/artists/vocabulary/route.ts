/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { ARTIST_VOCABULARY_LIMIT, artistVocabularyLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ArtistVocabularyService } from '@/lib/services/artist-vocabulary-service';
import { loggers } from '@/lib/utils/logger';
import { artistVocabularyQuerySchema } from '@/lib/validation/artist-vocabulary-query-schema';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

/**
 * `GET /api/artists/vocabulary?field=genres|tags&q=` — usage-ranked genre or
 * tag suggestions for the admin artist form's pill editors.
 *
 * One endpoint rather than one per column: `field` is a Zod enum backed by two
 * closed maps in the repository, so the checker proves the select is safe, and
 * `instruments` is the same shape whenever a UI wants it.
 *
 * An absent `q` deliberately returns the top terms rather than `[]` — the
 * dropdown's job is to show what the roster already uses before anyone types.
 */
export const GET = withRateLimit(
  artistVocabularyLimiter,
  ARTIST_VOCABULARY_LIMIT
)(
  withAdmin(async (request: NextRequest): Promise<NextResponse> => {
    // Parsed OUTSIDE the try/catch: a bad `field` is a 400, and routing it
    // through the catch would log a client mistake as a server error.
    const parsed = artistVocabularyQuerySchema.safeParse({
      field: request.nextUrl.searchParams.get('field') ?? undefined,
      q: request.nextUrl.searchParams.get('q') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid vocabulary query' }, { status: 400 });
    }

    try {
      const results = await ArtistVocabularyService.search(parsed.data.field, parsed.data.q);
      return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      logger.error('Unexpected error in artist vocabulary route', { error });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  })
);
