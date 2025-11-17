'use client';

import { MobileCardPlayer } from './components/ui/audio/mobile-first-players';
import { Card } from './components/ui/card';
import { ContentContainer } from './components/ui/content-container';
import PageContainer from './components/ui/page-container';

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
  return (
    <PageContainer>
      <ContentContainer>
        <Card className="mb-6">
          <h1 className="pt-4 px-4">Featured artists</h1>
          <MobileCardPlayer
            audioSrc={tracks[0].audioSrc}
            albumArt={tracks[0].albumArt}
            album={tracks[0].album}
            songTitle={tracks[0].songTitle}
            artist={tracks[0].artist}
          />
        </Card>
      </ContentContainer>
    </PageContainer>
  );
}
