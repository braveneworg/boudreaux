import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

import { FeaturedArtistsPlayer } from './components/featured-artists-player';
import { ContentContainer } from './components/ui/content-container';
import { Heading } from './components/ui/heading';
import PageContainer from './components/ui/page-container';

const DEFAULT_FEATURED_ARTISTS_LIMIT = 7;

export default async function Home() {
  // Fetch featured artists server-side
  const result = await FeaturedArtistsService.getFeaturedArtists(
    new Date(),
    DEFAULT_FEATURED_ARTISTS_LIMIT
  );
  const featuredArtists = result.success ? result.data : [];

  return (
    <PageContainer>
      <ContentContainer>
        <Heading level={1}>Featured artists</Heading>
        <FeaturedArtistsPlayer featuredArtists={featuredArtists} />
      </ContentContainer>
    </PageContainer>
  );
}
