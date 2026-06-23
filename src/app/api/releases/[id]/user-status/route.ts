/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { withAuth } from '@/lib/decorators/with-auth';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { PurchaseService } from '@/lib/services/purchase-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases/[id]/user-status
 * Returns purchase status, download info, and available formats for the
 * authenticated user. Returns 401 if not authenticated.
 */
export const GET = withAuth<{ id: string }>(async (_request, context, session) => {
  try {
    const { id: releaseId } = await context.params;
    const userId = session.user.id;

    const [purchase, digitalFormats] = await Promise.all([
      PurchaseRepository.findByUserAndRelease(userId, releaseId),
      new ReleaseDigitalFormatRepository().findAllByRelease(releaseId),
    ]);
    const downloadAccess = await PurchaseService.getDownloadAccessForPurchase(
      purchase,
      userId,
      releaseId
    );

    const availableFormats = digitalFormats.map((f) => ({
      formatType: f.formatType as DigitalFormatType,
      fileName: f.fileName ?? f.files[0]?.fileName ?? `${f.formatType}.zip`,
    }));

    return NextResponse.json({
      hasPurchase: purchase !== null,
      purchasedAt: purchase?.purchasedAt ?? null,
      downloadCount: downloadAccess.downloadCount,
      resetInHours: downloadAccess.resetInHours,
      availableFormats,
    });
  } catch (error) {
    loggers.media.error('Release user-status GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
