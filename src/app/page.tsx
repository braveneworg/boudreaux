'use client';

import { useForm } from 'react-hook-form';

import { MediaPlayer } from './components/ui/audio/media-player/media-player';
import { ContentContainer } from './components/ui/content-container';
import PageContainer from './components/ui/page-container';

import type { SearchFormValues } from './components/ui/audio/media-player/media-player';

const DEFAULT_POSTER = '/media/ceschi/we-are-enough.jpg';

const tracks = [
  {
    songTitle: 'We Are Enough',
    artist: 'Ceschi',
    audioSrc:
      '/media/ceschi/mp3s/Ceschi - Bring Us The Head Of Francisco False (Part 1) - 03 We Are Enough (produced by Danny T Levin).mp3',
    album:
      'Bring Us The Head Of Francisco False (Part 1): The Day You Realize That You Mean Nothing is Everything.',
    albumArt: DEFAULT_POSTER,
  },
];

export default function Home() {
  const form = useForm<SearchFormValues>();
  const { control } = form;

  return (
    <PageContainer>
      <ContentContainer>
        <h1 className="pt-4 px-4 h-13 mb-0 leading-tight">Featured artists</h1>
        {/* <MobileCardPlayer
          audioSrc={tracks[0].audioSrc}
          albumArt={tracks[0].albumArt}
          album={tracks[0].album}
          songTitle={tracks[0].songTitle}
          artist={tracks[0].artist}
        /> */}
        <MediaPlayer>
          <MediaPlayer.Search control={control} />
          <MediaPlayer.CoverArtCarousel selectedTrackId={selectedTrackId} />
          <MediaPlayer.CoverArtView />
          <MediaPlayer.InfoTickerTape />
          <MediaPlayer.Controls />
          <MediaPlayer.TrackListDrawer tracks={tracks} />
        </MediaPlayer>
      </ContentContainer>
    </PageContainer>
  );
}
