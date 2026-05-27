/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/collection
 * Returns all purchases for the authenticated user.
 * Returns 401 if not authenticated.
 */
export const GET = withAuth(async (_request, _context, session) => {
  try {
    const purchases = await PurchaseRepository.findAllByUser(session.user.id);

    return NextResponse.json({
      purchases,
      count: purchases.length,
      isAdmin: session.user.role === 'admin',
    });
  } catch (error) {
    console.error('User collection GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
