/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Heading } from '@/app/components/ui/heading';
import { BANNER_SLOTS } from '@/lib/constants/banner-slots';
import { BannerNotificationService } from '@/lib/services/banner-notification-service';

import { BannerSlotCard } from './banner-slot-card';
import { RotationIntervalForm } from './rotation-interval-form';

import type { BannerSlotFormData } from './banner-slot-card';

export default async function NotificationsPage() {
  const [notificationsResult, rotationInterval] = await Promise.all([
    BannerNotificationService.getAllNotifications(),
    BannerNotificationService.getRotationInterval(),
  ]);

  const notifications = notificationsResult.success ? notificationsResult.data : [];

  const slots: BannerSlotFormData[] = BANNER_SLOTS.map((slot) => {
    const notification = notifications.find((n) => n.slotNumber === slot.slotNumber);
    return {
      slotNumber: slot.slotNumber,
      imageFilename: slot.filename,
      notification: notification
        ? {
            id: notification.id,
            content: notification.content,
            textColor: notification.textColor,
            backgroundColor: notification.backgroundColor,
            displayFrom: notification.displayFrom?.toISOString() ?? null,
            displayUntil: notification.displayUntil?.toISOString() ?? null,
            repostedFromId: notification.repostedFromId,
          }
        : null,
    };
  });

  async function handleDelete(slotNumber: number) {
    'use server';
    const { deleteBannerNotificationAction } =
      await import('@/lib/actions/banner-notification-action');
    return deleteBannerNotificationAction(slotNumber);
  }

  return (
    <div className="container mx-auto">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Notifications', url: '/admin/notifications', isActive: true },
        ]}
      />

      <div className="mt-4 mb-4">
        <Heading level={1} className="h-auto">
          Banner Notifications
        </Heading>
      </div>

      <p className="text-zinc-950-foreground mb-4 px-6">
        Manage the notification text strips for each banner slot. Each slot has a fixed CDN image;
        you can optionally attach a notification strip with styled text.
      </p>

      <RotationIntervalForm currentInterval={rotationInterval} />

      <div className="mt-8 space-y-6">
        {slots.map((slot) => (
          <BannerSlotCard key={slot.slotNumber} slot={slot} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
