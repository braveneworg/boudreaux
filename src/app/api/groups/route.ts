/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { GroupService } from '@/lib/services/group-service';
import { extractFieldsWithValues } from '@/lib/utils/data-utils';

import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/groups
 * Get all groups or search for groups
 * Query params: skip, take, search
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const skip = searchParams.get('skip');
    const take = searchParams.get('take');
    const search = searchParams.get('search');

    const params = {
      ...(skip && { skip: parseInt(skip, 10) }),
      ...(take && { take: parseInt(take, 10) }),
      ...(search && { search }),
    };

    const result = await GroupService.getGroups(params);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 500 }
      );
    }

    return NextResponse.json({
      groups: result.data,
      count: result.data.length,
    });
  } catch (error) {
    console.error('Group GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/groups
 * Create a new group (admin only)
 */
export const POST = await withAdmin(async (request: NextRequest) => {
  try {
    const body = await extractFieldsWithValues(request.json());

    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const result = await GroupService.createGroup(body as Prisma.GroupCreateInput);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'Database unavailable' ? 503 : 400 }
      );
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error('Group POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
