/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { BannerNotificationService } from '@/lib/services/banner-notification-service';

const DEFAULT_TAKE = 20;
const MAX_TAKE = 100;

/**
 * Parses and normalizes the `take` query parameter into a safe Prisma limit.
 * Falls back to the default when the input is missing, non-numeric, non-finite,
 * non-integer, or non-positive, and clamps large values to the configured max.
 */
const parseTakeParam = (takeParam: string | null): number => {
  if (takeParam === null) {
    return DEFAULT_TAKE;
  }

  const parsedTake = Number(takeParam);

  if (!Number.isFinite(parsedTake) || !Number.isInteger(parsedTake) || parsedTake <= 0) {
    return DEFAULT_TAKE;
  }

  return Math.min(parsedTake, MAX_TAKE);
};

export const GET = withAdmin(async (request) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const take = parseTakeParam(searchParams.get('take'));

  const result = await BannerNotificationService.searchNotifications(q, take);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ notifications: result.data });
});
