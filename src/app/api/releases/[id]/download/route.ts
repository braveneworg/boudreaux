/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getToken } from 'next-auth/jwt';

import { prisma } from '@/lib/prisma';
import { PurchaseService } from '@/lib/services/purchase-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases/[id]/download
 *
 * Authenticated download gate. Checks:
 *   1. Auth — 401 if not signed in
 *   2. Release exists and is published — 404 if not
 *   3. Release has downloadUrls — 404 if empty
 *   4. User has purchased — 403 no_purchase if not
 *   5. Download cap not exceeded — 403 download_limit_reached if over cap
 *
 * On success: increments download counter and redirects (302) to the
 * first download URL.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: releaseId } = await params;

  // 1. Auth check
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token?.sub) {
    const callbackUrl = encodeURIComponent(`/api/releases/${releaseId}/download`);
    return new Response(null, {
      status: 302,
      headers: { Location: new URL(`/signin?callbackUrl=${callbackUrl}`, request.url).toString() },
    });
  }

  const userId = token.sub;

  // 2. Find release
  const release = await prisma.release.findFirst({
    where: { id: releaseId, publishedAt: { not: null } },
    select: { id: true, downloadUrls: true },
  });

  if (!release) {
    return NextResponse.json({ error: 'release_not_found' }, { status: 404 });
  }

  // 3. Release must have at least one download URL
  if (!release.downloadUrls?.length) {
    return NextResponse.json({ error: 'no_download_url' }, { status: 404 });
  }

  // 4 & 5. Check purchase + download cap
  const access = await PurchaseService.getDownloadAccess(userId, releaseId);

  if (!access.allowed) {
    const { MAX_RELEASE_DOWNLOAD_COUNT } = await import('@/lib/constants');
    return NextResponse.json(
      {
        error: access.reason,
        downloadCount: access.downloadCount,
        maxDownloadCount: MAX_RELEASE_DOWNLOAD_COUNT,
      },
      { status: 403 }
    );
  }

  // Increment download counter then redirect
  await PurchaseService.incrementDownloadCount(userId, releaseId);

  return new Response(null, {
    status: 302,
    headers: { Location: release.downloadUrls[0] },
  });
}
