/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/collection
 * Returns all purchases for the authenticated user.
 * Returns 401 if not authenticated.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string })?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const purchases = await PurchaseRepository.findAllByUser(userId);

    return NextResponse.json({
      purchases,
      count: purchases.length,
      isAdmin: session?.user?.role === 'admin',
    });
  } catch (error) {
    console.error('User collection GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
