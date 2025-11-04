'use client';

import Image from 'next/image';

import DataStoreHealthStatus from './components/data-store-health-status';
import { Card } from './components/ui/card';
import { ContentContainer } from './components/ui/content-container';
import PageContainer from './components/ui/page-container';
import { PageSectionParagraph } from './components/ui/page-section-paragraph';

export default function Home() {
  return (
    <PageContainer>
      <ContentContainer>
        <Card className="mb-6">
          <h1>Featured releases</h1>
          <Image
            src="/media/bandcamp/factor-chandelier/as-dark-as-today.jpg"
            alt="As Dark As Today album cover"
            width={380}
            height={380}
            className="inline-block ml-2 mr-1 mb-1 rounded-sm shadow-sm border-2 border-zinc-50"
          />
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
