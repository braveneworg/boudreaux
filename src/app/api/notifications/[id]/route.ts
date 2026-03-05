/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { NotificationBannerService } from '@/lib/services/notification-banner-service';
import { validateBody } from '@/lib/utils/validate-request';
import { updateNotificationBannerSchema } from '@/lib/validation/update-schemas';

import type { Prisma } from '@prisma/client';

/**
 * GET /api/notifications/[id]
 * Get a single notification banner by ID
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await NotificationBannerService.getNotificationBannerById(id);

    if (!result.success) {
      const status =
        result.error === 'Notification banner not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    if (!result.data) {
      return NextResponse.json({ error: 'Notification banner not found' }, { status: 404 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Notification GET by ID error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications/[id]
 * Update a notification banner by ID
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(updateNotificationBannerSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const result = await NotificationBannerService.updateNotificationBanner(
      id,
      validation.data as unknown as Prisma.NotificationUpdateInput
    );

    if (!result.success) {
      const status =
        result.error === 'Notification banner not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Notification PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications/[id]
 * Delete a notification banner by ID
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await NotificationBannerService.deleteNotificationBanner(id);

    if (!result.success) {
      const status =
        result.error === 'Notification banner not found'
          ? 404
          : result.error === 'Database unavailable'
            ? 503
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Notification DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
