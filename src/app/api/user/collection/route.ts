/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { withPublicReleaseByline } from '@/lib/utils/artist-release-credits';
import { loggers } from '@/lib/utils/logger';
import { PLAYABLE_FORMAT_TYPE } from '@/lib/utils/playable-format';
import { getFirstTrackStreamSource } from '@/lib/utils/release-helpers';

export const dynamic = 'force-dynamic';

type StoredPurchase = Awaited<ReturnType<typeof PurchaseRepository.findAllByUser>>[number];

/**
 * A purchase as the collection shows it: the public byline (ADR-0015), the
 * stream URL of the MP3 format's first track for the listening modal (`null`
 * when there is none), and each format's first file name without its key.
 */
const toCollectionPurchase = (purchase: StoredPurchase) => {
  const { release, ...rest } = withPublicReleaseByline(purchase);
  const playable = release.digitalFormats.find(
    ({ formatType }) => formatType === PLAYABLE_FORMAT_TYPE
  );
  return {
    ...rest,
    release: {
      ...release,
      playSrc: playable ? getFirstTrackStreamSource({ digitalFormats: [playable] }) : null,
      digitalFormats: release.digitalFormats.map(({ files, ...format }) => ({
        ...format,
        files: files.map(({ fileName }) => ({ fileName })),
      })),
    },
  };
};

/**
 * GET /api/user/collection
 * Returns all purchases for the authenticated user, each with the stream URL
 * its listening modal plays.
 * Returns 401 if not authenticated.
 */
export const GET = withAuth(async (_request, _context, session) => {
  try {
    const purchases = (await PurchaseRepository.findAllByUser(session.user.id)).map(
      toCollectionPurchase
    );

    return NextResponse.json({
      purchases,
      count: purchases.length,
      isAdmin: session.user.role === 'admin',
    });
  } catch (error) {
    loggers.media.error('User collection GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
