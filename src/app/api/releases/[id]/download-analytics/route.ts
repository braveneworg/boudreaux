/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';

export const dynamic = 'force-dynamic';

const downloadEventRepo = new DownloadEventRepository();

/**
 * GET /api/releases/[id]/download-analytics
 * Returns download analytics for a release (admin only).
 * Optional query params: startDate, endDate (ISO strings)
 */
export const GET = withAdmin(async (request, context) => {
  try {
    const { id: releaseId } = (await context.params) as { id: string };

    if (!releaseId) {
      return NextResponse.json({ error: 'Release ID is required' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    const dateRange: { startDate?: Date; endDate?: Date } = {};

    if (startDateParam) {
      const parsed = new Date(startDateParam);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid startDate format' }, { status: 400 });
      }
      dateRange.startDate = parsed;
    }

    if (endDateParam) {
      const parsed = new Date(endDateParam);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid endDate format' }, { status: 400 });
      }
      dateRange.endDate = parsed;
    }

    const options = Object.keys(dateRange).length > 0 ? dateRange : undefined;

    const [formatBreakdown, uniqueUsers, totalDownloads] = await Promise.all([
      downloadEventRepo.getAnalyticsByRelease(releaseId, options),
      downloadEventRepo.getUniqueUsers(releaseId, options),
      downloadEventRepo.getTotalDownloads(releaseId, options),
    ]);

    return NextResponse.json({
      success: true,
      releaseId,
      totalDownloads,
      uniqueUsers,
      formatBreakdown,
      ...(options && {
        dateRange: {
          startDate: options.startDate?.toISOString() ?? null,
          endDate: options.endDate?.toISOString() ?? null,
        },
      }),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
});
