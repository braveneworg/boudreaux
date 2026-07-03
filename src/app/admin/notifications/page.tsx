/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Bell } from 'lucide-react';

import { SectionHeader } from '@/app/components/ui/section-header';
import { ZinePanel } from '@/app/components/ui/zine-panel';
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

  return (
    <ZinePanel
      accent="storm"
      tape={false}
      contentClassName="space-y-6"
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        { anchorText: 'Notifications', url: '/admin/notifications', isActive: true },
      ]}
    >
      <SectionHeader
        icon={Bell}
        title="Banner Notifications"
        helpText="Manage the notification text strip for each banner slot. Each slot has a fixed CDN image; you can optionally attach a strip with styled text and a display window."
      />

      <RotationIntervalForm currentInterval={rotationInterval} />

      <div className="space-y-6">
        {slots.map((slot) => (
          <BannerSlotCard key={slot.slotNumber} slot={slot} />
        ))}
      </div>
    </ZinePanel>
  );
}
