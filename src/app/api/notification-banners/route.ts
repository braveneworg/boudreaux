/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';

import { BannerNotificationService } from '@/lib/services/banner-notification-service';

export const dynamic = 'force-dynamic';

export const GET = async (): Promise<NextResponse> => {
  const result = await BannerNotificationService.getActiveBanners();

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data);
};
