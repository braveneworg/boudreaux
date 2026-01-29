import Link from 'next/link';

import { Plus } from 'lucide-react';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Button } from '@/app/components/ui/button';
import { Heading } from '@/app/components/ui/heading';
import { NotificationBannerService } from '@/lib/services/notification-banner-service';

import { NotificationBannerList } from './notification-banner-list';

export default async function NotificationsPage() {
  const result = await NotificationBannerService.getAllNotificationBanners();
  const notifications = result.success ? result.data : [];

  return (
    <div className="container mx-auto">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Notifications', url: '/admin/notifications', isActive: true },
        ]}
      />

      <div className="mt-4">
        <Heading level={1}>Notification Banners</Heading>
      </div>

      <p className="text-muted-foreground mt-2 mb-4">
        Manage the notification banners displayed on the home page. Banners are shown in a carousel
        format with auto-cycling every 10 seconds.
      </p>

      <Link href="/admin/notifications/new" className="inline-block mb-6">
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Banner
        </Button>
      </Link>

      <NotificationBannerList notifications={notifications} />
    </div>
  );
}
