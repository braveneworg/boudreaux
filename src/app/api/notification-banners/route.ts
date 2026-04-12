/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { PUBLIC_LIMIT, publicLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { BannerNotificationService } from '@/lib/services/banner-notification-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notification-banners
 * Returns active banner notifications.
 *
 * Query params:
 *   all – When "true", returns banners data + all notifications (for landing page).
 */
export const GET = withRateLimit(
  publicLimiter,
  PUBLIC_LIMIT
)(async (request: NextRequest): Promise<NextResponse> => {
  const all = request.nextUrl.searchParams.get('all') === 'true';

  if (all) {
    const [bannersResult, notificationsResult] = await Promise.all([
      BannerNotificationService.getActiveBanners(),
      BannerNotificationService.getAllNotifications(),
    ]);

    return NextResponse.json(
      {
        banners: bannersResult.success
          ? bannersResult.data
          : { banners: [], rotationInterval: 5000 },
        notifications: notificationsResult.success ? notificationsResult.data : [],
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      }
    );
  }

  const result = await BannerNotificationService.getActiveBanners();

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
});
