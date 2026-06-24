/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { withAdmin } from '@/lib/decorators/with-auth';
import { ReleaseService } from '@/lib/services/release-service';
import type { CreateReleaseData } from '@/lib/types/domain/release';
import { computeNextSkip } from '@/lib/types/pagination';
import { loggers } from '@/lib/utils/logger';
import { validateBody } from '@/lib/utils/validate-request';
import { createReleaseSchema } from '@/lib/validation/create-release-schema';

import type { Session } from 'next-auth';

export const dynamic = 'force-dynamic';

const DEFAULT_TAKE = 24;
const MAX_TAKE = 100;

/** Parse and clamp the `skip`/`take` offset-pagination params from a request. */
const parsePagination = (searchParams: URLSearchParams): { skip: number; take: number } => {
  const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);
  const take = Math.min(
    Math.max(1, parseInt(searchParams.get('take') ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE),
    MAX_TAKE
  );
  return { skip, take };
};

/** Map a service error to a 503 (DB unavailable) or 500 (generic) status. */
const errorStatus = (error: string | undefined): number =>
  error === 'Database unavailable' ? 503 : 500;

/** Return a 401 response unless the session belongs to an authenticated admin. */
const requireAdmin = (session: Session | null): NextResponse | null =>
  !session?.user?.id || session.user?.role !== 'admin'
    ? NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    : null;

/** Handle the public `listing=published` branch of GET /api/releases. */
const handlePublishedListing = async (searchParams: URLSearchParams): Promise<NextResponse> => {
  const { skip, take } = parsePagination(searchParams);
  const search = searchParams.get('search') ?? undefined;

  const result = await ReleaseService.getPublishedReleases({ skip, take, search });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  }

  return NextResponse.json(
    { rows: result.data, nextSkip: computeNextSkip(result.data.length, skip, take) },
    {
      headers: {
        // Search/offset pages vary per request; do not share-cache them.
        'Cache-Control': 'no-store',
      },
    }
  );
};

/** Handle the admin (default) branch of GET /api/releases, gated on admin auth. */
const handleAdminListing = async (searchParams: URLSearchParams): Promise<NextResponse> => {
  const search = searchParams.get('search');
  const artistIds = searchParams.getAll('artistIds');
  const published = searchParams.get('published');
  const deleted = searchParams.get('deleted') === 'true';

  const session = await auth();
  const authError = requireAdmin(session);
  if (authError) {
    return authError;
  }

  const { skip, take } = parsePagination(searchParams);

  const params = {
    skip,
    take,
    ...(search && { search }),
    ...(artistIds.length > 0 && { artistIds }),
    ...(published !== null && { published: published === 'true' }),
    ...(deleted && { deleted }),
  };

  const result = await ReleaseService.getReleases(params);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  }

  return NextResponse.json(
    {
      // The admin listing projection carries no BigInt fields (digital-format
      // files/URLs are not loaded), so the payload is JSON-safe as-is.
      rows: result.data,
      nextSkip: computeNextSkip(result.data.length, skip, take),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    }
  );
};

/**
 * GET /api/releases
 * Get all releases or search for releases.
 *
 * Query params:
 *   listing    – When "published", returns public published releases via `getPublishedReleases()`.
 *   skip, take, search, artistIds, published – Pagination/filter params for admin listing mode.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const listing = searchParams.get('listing');

    return listing === 'published'
      ? await handlePublishedListing(searchParams)
      : await handleAdminListing(searchParams);
  } catch (error) {
    loggers.media.error('Release GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/releases
 * Create a new release (admin only)
 */
export const POST = withAdmin(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const validation = validateBody(createReleaseSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const result = await ReleaseService.createRelease(
      validation.data as unknown as CreateReleaseData
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 400 }
      );
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    loggers.media.error('Release POST error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
