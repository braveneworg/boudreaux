import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { NotificationBannerService } from '@/lib/services/notification-banner-service';

import { FeaturedArtistsPlayer } from './components/featured-artists-player';
import { NotificationBanner } from './components/notification-banner';
import { ContentContainer } from './components/ui/content-container';
import { Heading } from './components/ui/heading';
import PageContainer from './components/ui/page-container';

const DEFAULT_FEATURED_ARTISTS_LIMIT = 7;

export default async function Home() {
  // Fetch featured artists and notification banners server-side
  const [featuredArtistsResult, notificationBannersResult] = await Promise.all([
    FeaturedArtistsService.getFeaturedArtists(new Date(), DEFAULT_FEATURED_ARTISTS_LIMIT),
    NotificationBannerService.getActiveNotificationBanners(new Date()),
  ]);

  const featuredArtists = featuredArtistsResult.success ? featuredArtistsResult.data : [];
  const notificationBanners = notificationBannersResult.success
    ? notificationBannersResult.data
    : [];

  return (
    <PageContainer>
      {/* Notification Banner - only shown on home page */}
      {notificationBanners.length > 0 && <NotificationBanner notifications={notificationBanners} />}

      <ContentContainer>
        <Heading level={1}>Featured artists</Heading>
        <FeaturedArtistsPlayer featuredArtists={featuredArtists} />
      </ContentContainer>
    </PageContainer>
  );
}
