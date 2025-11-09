import ParticleGeneratorPlayGround from '../components/ui/backgrounds/particle-generator';
import { ContentContainer } from '../components/ui/content-container';
import PageContainer from '../components/ui/page-container';

export default function ParticleGeneratorPage() {
  return (
    <PageContainer>
      <ContentContainer>
        <ParticleGeneratorPlayGround />
      </ContentContainer>
    </PageContainer>
  );
}
