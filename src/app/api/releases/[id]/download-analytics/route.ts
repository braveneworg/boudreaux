/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';

export const dynamic = 'force-dynamic';

const downloadEventRepo = new DownloadEventRepository();

type DateRange = { startDate?: Date; endDate?: Date };

type DateRangeResult = { ok: true; dateRange: DateRange } | { ok: false; error: string };

/**
 * Parse `startDate`/`endDate` query params into a `DateRange`. Each is optional;
 * an unparseable value fails with a field-specific error (startDate first).
 */
const parseDateRange = (searchParams: URLSearchParams): DateRangeResult => {
  const dateRange: DateRange = {};

  const startDateParam = searchParams.get('startDate');
  if (startDateParam) {
    const parsed = new Date(startDateParam);
    if (isNaN(parsed.getTime())) {
      return { ok: false, error: 'Invalid startDate format' };
    }
    dateRange.startDate = parsed;
  }

  const endDateParam = searchParams.get('endDate');
  if (endDateParam) {
    const parsed = new Date(endDateParam);
    if (isNaN(parsed.getTime())) {
      return { ok: false, error: 'Invalid endDate format' };
    }
    dateRange.endDate = parsed;
  }

  return { ok: true, dateRange };
};

/** Serialize an optional `DateRange` into the response's `dateRange` field. */
const serializeDateRange = (
  options: DateRange | undefined
): { dateRange: { startDate: string | null; endDate: string | null } } | Record<string, never> =>
  options
    ? {
        dateRange: {
          startDate: options.startDate?.toISOString() ?? null,
          endDate: options.endDate?.toISOString() ?? null,
        },
      }
    : {};

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

    const parsed = parseDateRange(request.nextUrl.searchParams);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const options = Object.keys(parsed.dateRange).length > 0 ? parsed.dateRange : undefined;

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
      ...serializeDateRange(options),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
});
