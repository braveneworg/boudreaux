/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { NotificationBannerService } from '@/lib/services/notification-banner-service';

/**
 * GET /api/notifications
 * Get all active notification banners for public display
 */
export async function GET() {
  try {
    const result = await NotificationBannerService.getActiveNotificationBanners(new Date());

    if (!result.success) {
      const status = result.error === 'Database unavailable' ? 503 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
