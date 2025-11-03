'use client';

import DataStoreHealthStatus from './components/data-store-health-status';
import { ContentContainer } from './components/ui/content-container';
import PageContainer from './components/ui/page-container';

export default function Home() {
  return (
    <PageContainer>
      <ContentContainer>
        <DataStoreHealthStatus />
      </ContentContainer>
    </PageContainer>
  );
}
