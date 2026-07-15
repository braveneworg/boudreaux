/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PLAYLISTS_PAGE_SIZE } from '@/lib/constants/playlists';
import { withAuth } from '@/lib/decorators/with-auth';
import { PlaylistService } from '@/lib/services/playlist-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const MAX_TAKE = 100;

/** Parse and clamp the `skip`/`take` offset-pagination params from a request. */
const parsePagination = (searchParams: URLSearchParams): { skip: number; take: number } => {
  const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);
  const take = Math.min(
    Math.max(
      1,
      parseInt(searchParams.get('take') ?? String(PLAYLISTS_PAGE_SIZE), 10) || PLAYLISTS_PAGE_SIZE
    ),
    MAX_TAKE
  );
  return { skip, take };
};

/**
 * GET /api/playlists
 * Page through the authenticated user's playlists (newest-touched first).
 *
 * Query params:
 *   skip, take – Offset pagination; malformed values clamp to defaults
 *                (skip ≥ 0, take 1–100, default take 24).
 *   search     – Optional case-insensitive title filter.
 */
export const GET = withAuth(
  async (request: NextRequest, _context, session): Promise<NextResponse> => {
    try {
      const { searchParams } = request.nextUrl;
      const { skip, take } = parsePagination(searchParams);
      const search = searchParams.get('search') ?? undefined;

      const result = await PlaylistService.getMyPlaylists(session.user.id, { skip, take, search });

      return NextResponse.json(result, {
        headers: {
          // Per-user listing; never share-cache or store it.
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (error) {
      loggers.media.error('Playlists GET error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
