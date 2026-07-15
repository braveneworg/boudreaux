/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { PlaylistService } from '@/lib/services/playlist-service';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

/** Detail payload is per-viewer (`isOwner`); never share-cache or store it. */
const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

/**
 * GET /api/playlists/[id]
 * Fetch one playlist with its resolved items. Owners see their own playlists
 * regardless of visibility; everyone else only sees public ones. Missing,
 * private-unowned, and malformed ids all answer 404 so the response never
 * reveals whether a hidden playlist exists.
 */
export const GET = withAuth<{ id: string }>(
  async (_request, context, session): Promise<NextResponse> => {
    try {
      const { id } = await context.params;

      if (!isValidObjectId(id)) {
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      }

      const detail = await PlaylistService.getOwnedOrPublicDetail(id, session.user.id);

      if (!detail) {
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      }

      return NextResponse.json(detail, { headers: CACHE_HEADERS });
    } catch (error) {
      loggers.media.error('Playlist detail GET error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
