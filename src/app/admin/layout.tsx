import { ContentContainer } from '../components/ui/content-container';
import PageContainer from '../components/ui/page-container';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageContainer>
      <ContentContainer>
        <section>{children}</section>
      </ContentContainer>
    </PageContainer>
  );
}
