/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { PurchaseService } from '@/lib/services/purchase-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/releases/[id]/user-status
 * Returns purchase status, download info, and available formats for the authenticated user.
 * Returns 401 if not authenticated.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: releaseId } = await params;
    const session = await auth();
    const userId = (session?.user as { id?: string })?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    console.error('Release user-status GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
