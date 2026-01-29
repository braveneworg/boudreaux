import NotificationBannerForm from '@/app/components/forms/notification-banner-form';

interface EditNotificationPageProps {
  params: Promise<{ notificationId: string }>;
}

export default async function EditNotificationPage({ params }: EditNotificationPageProps) {
  const { notificationId } = await params;
  return <NotificationBannerForm notificationId={notificationId} />;
}
