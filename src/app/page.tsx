'use client';

import { ContentContainer } from './components/ui/content-container';
import { Heading } from './components/ui/heading';
import PageContainer from './components/ui/page-container';
// import { FeaturedArtistsService } from './lib/services/featured-artists-service';

// import type { FeaturedArtist } from './lib/types/media-models';

// import type { SearchFormValues } from './components/ui/audio/media-player/media-player';

// const DEFAULT_POSTER = '/media/ceschi/we-are-enough.jpg';

// Example track data - not currently used
// const tracks = [
//   {
//     songTitle: 'We Are Enough',
//     artist: 'Ceschi',
//     audioSrc:
//       '/media/ceschi/mp3s/Ceschi - Bring Us The Head Of Francisco False (Part 1) - 03 We Are Enough (produced by Danny T Levin).mp3',
//     album:
//       'Bring Us The Head Of Francisco False (Part 1): The Day You Realize That You Mean Nothing is Everything.',
//     albumArt: DEFAULT_POSTER,
//   },
// ];

export default function Home() {
  // const form = useForm<SearchFormValues>();
  // const { control } = form;
  // const [featuredArtists, setFeaturedArtists] = useState<FeaturedArtist[] | null>(null);

  // useEffect(() => {
  //   if (!featuredArtists) {
  //     // Fetch or set featuredArtists data here
  //     FeaturedArtistsService.getFeaturedArtists(new Date()).then((response) => {
  //       if (response.success) {
  //         setFeaturedArtists(response.data);
  //       } else {
  //         console.error('Failed to fetch featured artists');
  //       }
  //     });
  //   }
  // }, [featuredArtists]);

  return (
    <PageContainer>
      <ContentContainer>
        <Heading level={1}>Featured artists</Heading>
        {/* Example MediaPlayer usage - requires proper data structure
        <MediaPlayer>
          <MediaPlayer.Search control={control} />
          <MediaPlayer.CoverArtCarousel artists={artistList} numberUp={4} />
          <MediaPlayer.CoverArtView artistRelease={{ release, artist }} />
          <MediaPlayer.InfoTickerTape artistRelease={{ release, artist }} trackName="Track Title" />
          <MediaPlayer.Controls audioSrc={tracks[0].audioSrc} />
          <MediaPlayer.TrackListDrawer artistRelease={{ release, artist }} />
        </MediaPlayer>
        */}
        {/* TODO: Implement proper MediaPlayer integration with featured artists data */}
      </ContentContainer>
    </PageContainer>
  );
}
