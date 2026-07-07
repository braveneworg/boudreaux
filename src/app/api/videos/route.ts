/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withAuth } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { VideoService } from '@/lib/services/video-service';
import type { Video, VideoListFilters } from '@/lib/types/domain/video';
import { computeNextSkip } from '@/lib/types/pagination';
import { loggers } from '@/lib/utils/logger';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { signStreamUrl } from '@/lib/utils/sign-stream-url';

export const dynamic = 'force-dynamic';

const DEFAULT_TAKE = 5;
const MAX_TAKE = 50;

/** Signed URLs are per-user; never share-cache the listing. */
const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

/**
 * A public video row: the internal `createdBy`/`updatedBy` audit ObjectIds are
 * dropped, with the runtime-only, per-request signed stream URL attached.
 */
type VideoRowWithStream = Omit<Video, 'createdBy' | 'updatedBy'> & { streamUrl: string | null };

/** Parse and clamp the `skip`/`take` offset-pagination params from a request. */
const parsePagination = (searchParams: URLSearchParams): { skip: number; take: number } => {
  const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);
  const take = Math.min(
    Math.max(1, parseInt(searchParams.get('take') ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE),
    MAX_TAKE
  );
  return { skip, take };
};

/** Parse the sort direction; anything other than `asc` (incl. absent) → `desc`. */
const parseSort = (searchParams: URLSearchParams): 'asc' | 'desc' =>
  searchParams.get('sort') === 'asc' ? 'asc' : 'desc';

/** Parse the tri-state published filter: `true`/`false`/absent → `true`/`false`/`null`. */
const parsePublished = (searchParams: URLSearchParams): boolean | null => {
  const published = searchParams.get('published');
  if (published === 'true') return true;
  if (published === 'false') return false;
  return null;
};

/** Map a service error to a 503 (DB unavailable) or 500 (generic) status. */
const errorStatus = (error: string | undefined): number =>
  error === 'Database unavailable' ? 503 : 500;

/** Drop audit fields, attach a signed stream URL, then BigInt-serialize for JSON. */
const buildRows = (videos: Video[]): VideoRowWithStream[] =>
  serializeForResponse(
    videos.map(({ createdBy: _createdBy, updatedBy: _updatedBy, ...video }) => ({
      ...video,
      streamUrl: signStreamUrl(video.s3Key),
    }))
  );

/** Build the paginated `{ rows, nextSkip }` success response for a page of videos. */
const pageResponse = (videos: Video[], skip: number, take: number): NextResponse => {
  const rows = buildRows(videos);
  return NextResponse.json(
    { rows, nextSkip: computeNextSkip(rows.length, skip, take) },
    { headers: CACHE_HEADERS }
  );
};

/** Handle the `listing=published` branch — available to any signed-in user. */
const handlePublishedListing = async (searchParams: URLSearchParams): Promise<NextResponse> => {
  const { skip, take } = parsePagination(searchParams);
  const sort = parseSort(searchParams);

  const result = await VideoService.getPublishedVideos({ sort, skip, take });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  }

  return pageResponse(result.data, skip, take);
};

/** Handle the admin (default) branch — gated on the caller's admin role. */
const handleAdminListing = async (
  searchParams: URLSearchParams,
  role: string
): Promise<NextResponse> => {
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { skip, take } = parsePagination(searchParams);
  const search = searchParams.get('search') ?? undefined;

  const filters: VideoListFilters = {
    skip,
    take,
    sort: parseSort(searchParams),
    published: parsePublished(searchParams),
    archived: searchParams.get('archived') === 'true',
    ...(search && { search }),
  };

  const result = await VideoService.getVideos(filters);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  }

  return pageResponse(result.data, skip, take);
};

/**
 * GET /api/videos
 *
 * Signed-in-only listing (unlike the public `/api/releases`) — the whole
 * surface is gated behind `withAuth`, then rate-limited.
 *
 * Query params:
 *   listing   – When "published", returns published, non-archived videos for
 *               any signed-in user via `getPublishedVideos()`.
 *   skip, take, search, published, archived, sort – Pagination/filter params
 *               for the admin listing mode (requires the admin role).
 */
export const GET = withRateLimit(
  publicLimiter,
  PUBLIC_LIMIT
)(
  withAuth(async (request: NextRequest, _context, session) => {
    try {
      const searchParams = request.nextUrl.searchParams;

      return searchParams.get('listing') === 'published'
        ? await handlePublishedListing(searchParams)
        : await handleAdminListing(searchParams, session.user.role);
    } catch (error) {
      loggers.media.error('Video GET error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  })
);
