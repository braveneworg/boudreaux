/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { SEARCH_LIMIT, searchLimiter } from '@/lib/config/rate-limit-tiers';
import { PLAYLIST_SEARCH_MIN_QUERY_LENGTH } from '@/lib/constants/playlists';
import { withAuth } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { PlaylistService } from '@/lib/services/playlist-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

// Per-user search results; never share-cache or store them.
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

/**
 * GET /api/playlists/media-search?q=...
 * Grouped media search for the playlist creator (songs, videos, public
 * playlists, releases, artist matches). Rate limited and auth gated.
 *
 * Query params:
 *   q – Search query; trimmed before use. Trimmed queries shorter than
 *       PLAYLIST_SEARCH_MIN_QUERY_LENGTH short-circuit to `{ groups: [] }`
 *       without hitting the service (cheap no-op, not an error).
 */
export const GET = withRateLimit(
  searchLimiter,
  SEARCH_LIMIT
)(
  withAuth(async (request: NextRequest, _context, session): Promise<NextResponse> => {
    try {
      const q = (request.nextUrl.searchParams.get('q') ?? '').trim();

      if (q.length < PLAYLIST_SEARCH_MIN_QUERY_LENGTH) {
        return NextResponse.json({ groups: [] }, { headers: NO_STORE_HEADERS });
      }

      const result = await PlaylistService.searchMedia(q, session.user.id);

      return NextResponse.json(result, { headers: NO_STORE_HEADERS });
    } catch (error) {
      loggers.media.error('Playlist media-search error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  })
);
