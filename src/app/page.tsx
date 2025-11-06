'use client';

import DataStoreHealthStatus from './components/data-store-health-status';
import AudioPlayer from './components/ui/audio-player';
import { Card } from './components/ui/card';
import { ContentContainer } from './components/ui/content-container';
import PageContainer from './components/ui/page-container';
import { PageSectionParagraph } from './components/ui/page-section-paragraph';

export default function Home() {
  const audioSrc =
    '/media/ceschi/mp3s/Ceschi - Bring Us The Head Of Francisco False (Part 1) - 03 We Are Enough (produced by Danny T Levin).mp3'; // Replace with your audio file URL
  const posterSrc = '/media/ceschi/we-are-enough.jpg'; // Replace with your album art image URL

  return (
    <PageContainer>
      <ContentContainer>
        <Card className="mb-6">
          <h1>Featured releases</h1>
          <AudioPlayer audioSrc={audioSrc} posterSrc={posterSrc} />
          {/* <Image
            src="/media/bandcamp/factor-chandelier/as-dark-as-today.jpg"
            alt="As Dark As Today album cover"
            width={380}
            height={380}
            className="inline-block ml-2 mr-1 mb-1 rounded-sm shadow-sm border-2 border-zinc-50"
          /> */}
        </Card>
        <Card className="mb-6">
          <h1>Featured artists</h1>
          <PageSectionParagraph>
            Explore the diverse talents that define Fake Four Inc., showcasing artists who push the
            boundaries of music and creativity.
          </PageSectionParagraph>
        </Card>
        <Card>
          <DataStoreHealthStatus />
        </Card>
      </ContentContainer>
    </PageContainer>
  );
}
