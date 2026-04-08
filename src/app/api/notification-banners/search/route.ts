/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { BannerNotificationService } from '@/lib/services/banner-notification-service';

export const GET = withAdmin(async (request) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const take = parseInt(searchParams.get('take') ?? '20', 10);

  const result = await BannerNotificationService.searchNotifications(q, take);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ notifications: result.data });
});
